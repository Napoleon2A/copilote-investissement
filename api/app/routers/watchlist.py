"""
Routes : watchlists
  GET    /watchlists                  → toutes les watchlists
  POST   /watchlists                  → créer une watchlist
  GET    /watchlists/{id}             → détail avec items
  DELETE /watchlists/{id}             → supprimer
  POST   /watchlists/{id}/items       → ajouter un ticker
  DELETE /watchlists/{id}/items/{ticker} → retirer un ticker
  GET    /watchlists/{id}/snapshot    → snapshot prix de tous les tickers
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel
from typing import Optional
import logging

from app.database import get_session
from app.models import Watchlist, WatchlistItem, Company
from app.services import data_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/watchlists", tags=["watchlists"])


class WatchlistCreate(BaseModel):
    name: str
    description: Optional[str] = None


class WatchlistItemCreate(BaseModel):
    ticker: str
    note: Optional[str] = None


@router.get("")
async def list_watchlists(session: AsyncSession = Depends(get_session)):
    result = await session.exec(select(Watchlist))
    return result.all()


@router.post("")
async def create_watchlist(data: WatchlistCreate, session: AsyncSession = Depends(get_session)):
    wl = Watchlist(name=data.name, description=data.description)
    session.add(wl)
    try:
        await session.commit()
        await session.refresh(wl)
    except (IntegrityError, Exception) as e:
        await session.rollback()
        logger.error(f"Erreur création watchlist: {e}", exc_info=True)
        raise HTTPException(500, "Erreur lors de la création de la watchlist")
    return wl


@router.get("/{watchlist_id}")
async def get_watchlist(watchlist_id: int, session: AsyncSession = Depends(get_session)):
    wl = await session.get(Watchlist, watchlist_id)
    if not wl:
        raise HTTPException(404, "Watchlist introuvable")

    # Charger les items avec leurs entreprises
    result = await session.exec(
        select(WatchlistItem, Company)
        .join(Company, WatchlistItem.company_id == Company.id)
        .where(WatchlistItem.watchlist_id == watchlist_id)
    )
    items = []
    for item, company in result:
        items.append({
            "id": item.id,
            "ticker": company.ticker,
            "name": company.name,
            "sector": company.sector,
            "note": item.note,
            "added_at": item.added_at,
        })

    return {"watchlist": wl, "items": items}


@router.delete("/{watchlist_id}")
async def delete_watchlist(watchlist_id: int, session: AsyncSession = Depends(get_session)):
    wl = await session.get(Watchlist, watchlist_id)
    if not wl:
        raise HTTPException(404, "Watchlist introuvable")
    await session.delete(wl)
    try:
        await session.commit()
    except (IntegrityError, Exception) as e:
        await session.rollback()
        logger.error(f"Erreur suppression watchlist {watchlist_id}: {e}", exc_info=True)
        raise HTTPException(500, "Erreur lors de la suppression de la watchlist")
    return {"deleted": watchlist_id}


@router.post("/{watchlist_id}/items")
async def add_to_watchlist(
    watchlist_id: int,
    data: WatchlistItemCreate,
    session: AsyncSession = Depends(get_session)
):
    """
    Ajoute un ticker à une watchlist.
    Crée l'entreprise en DB si elle n'existe pas encore (sync auto yfinance).
    """
    wl = await session.get(Watchlist, watchlist_id)
    if not wl:
        raise HTTPException(404, "Watchlist introuvable")

    ticker = data.ticker.upper()

    # Récupérer ou créer l'entreprise
    result = await session.exec(select(Company).where(Company.ticker == ticker))
    company = result.first()

    if not company:
        info = data_service.get_company_info(ticker)
        from datetime import datetime
        company = Company(
            ticker=ticker,
            name=info.get("longName") or info.get("shortName") or ticker,
            exchange=info.get("exchange"),
            sector=info.get("sector"),
            industry=info.get("industry"),
            country=info.get("country"),
            currency=info.get("currency"),
            market_cap=info.get("marketCap"),
            last_updated=datetime.utcnow(),
        )
        session.add(company)
        await session.flush()  # Pour obtenir l'id

    # Vérifier que l'item n'existe pas déjà
    existing = await session.exec(
        select(WatchlistItem)
        .where(WatchlistItem.watchlist_id == watchlist_id)
        .where(WatchlistItem.company_id == company.id)
    )
    if existing.first():
        raise HTTPException(409, f"'{ticker}' est déjà dans cette watchlist")

    item = WatchlistItem(
        watchlist_id=watchlist_id,
        company_id=company.id,
        note=data.note,
    )
    session.add(item)
    try:
        await session.commit()
    except (IntegrityError, Exception) as e:
        await session.rollback()
        logger.error(f"Erreur ajout {ticker} à watchlist {watchlist_id}: {e}", exc_info=True)
        raise HTTPException(500, "Erreur lors de l'ajout à la watchlist")
    return {"added": ticker, "watchlist_id": watchlist_id}


@router.delete("/{watchlist_id}/items/{ticker}")
async def remove_from_watchlist(
    watchlist_id: int,
    ticker: str,
    session: AsyncSession = Depends(get_session)
):
    ticker = ticker.upper()
    result = await session.exec(select(Company).where(Company.ticker == ticker))
    company = result.first()
    if not company:
        raise HTTPException(404, f"Ticker '{ticker}' introuvable")

    item_result = await session.exec(
        select(WatchlistItem)
        .where(WatchlistItem.watchlist_id == watchlist_id)
        .where(WatchlistItem.company_id == company.id)
    )
    item = item_result.first()
    if not item:
        raise HTTPException(404, "Item introuvable dans cette watchlist")

    await session.delete(item)
    try:
        await session.commit()
    except (IntegrityError, Exception) as e:
        await session.rollback()
        logger.error(f"Erreur suppression {ticker} de watchlist {watchlist_id}: {e}", exc_info=True)
        raise HTTPException(500, "Erreur lors de la suppression de l'item")
    return {"removed": ticker, "watchlist_id": watchlist_id}


@router.get("/{watchlist_id}/snapshot")
async def get_watchlist_snapshot(watchlist_id: int, session: AsyncSession = Depends(get_session)):
    """
    Snapshot en temps réel de tous les tickers de la watchlist.
    Prix, variations, scores — parfait pour le tableau de bord.
    """
    from app.services.scoring import compute_all_scores, get_score_label

    wl = await session.get(Watchlist, watchlist_id)
    if not wl:
        raise HTTPException(404, "Watchlist introuvable")

    result = await session.exec(
        select(WatchlistItem, Company)
        .join(Company, WatchlistItem.company_id == Company.id)
        .where(WatchlistItem.watchlist_id == watchlist_id)
    )

    snapshots = []
    for item, company in result:
        changes = data_service.get_price_changes(company.ticker)
        fundamentals = data_service.get_fundamentals(company.ticker)
        scores = compute_all_scores(fundamentals, changes) if (changes or fundamentals) else None

        snapshots.append({
            "ticker": company.ticker,
            "name": company.name,
            "sector": company.sector,
            "note": item.note,
            "price": changes.get("current_price") if changes else None,
            "change_1d": changes.get("change_1d") if changes else None,
            "change_1m": changes.get("change_1m") if changes else None,
            "change_ytd": changes.get("change_ytd") if changes else None,
            "pct_from_52w_high": changes.get("pct_from_52w_high") if changes else None,
            "composite_score": scores["composite"] if scores else None,
            "composite_label": get_score_label(scores["composite"]) if scores else None,
        })

    return {
        "watchlist": wl.name,
        "item_count": len(snapshots),
        "snapshots": snapshots,
    }
