"""
Routes : portefeuille
  GET    /portfolio                   → résumé du portefeuille
  POST   /portfolio/transactions      → ajouter achat/vente
  GET    /portfolio/positions         → positions ouvertes avec P&L
  GET    /portfolio/performance       → performance globale
  POST   /portfolio/positions/{ticker}/thesis → écrire/mettre à jour la thèse
  GET    /portfolio/positions/{ticker}/thesis → lire la thèse
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import logging

from app.database import get_session
from app.models import Portfolio, Position, Transaction, Company, InvestmentThesis
from app.services import data_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


class TransactionCreate(BaseModel):
    ticker: str
    type: str               # "buy" | "sell"
    quantity: float
    price: float
    fees: float = 0.0
    date: Optional[datetime] = None
    note: Optional[str] = None


class ThesisCreate(BaseModel):
    thesis: str
    catalysts: Optional[str] = None
    risks: Optional[str] = None
    horizon: Optional[str] = None
    conviction: int = 3
    invalidation_conditions: Optional[str] = None


async def _get_or_create_portfolio(session: AsyncSession) -> Portfolio:
    """Retourne le premier portefeuille ou en crée un."""
    result = await session.exec(select(Portfolio))
    portfolio = result.first()
    if not portfolio:
        portfolio = Portfolio(name="Mon portefeuille", currency="EUR")
        session.add(portfolio)
        try:
            await session.commit()
            await session.refresh(portfolio)
        except (IntegrityError, Exception) as e:
            await session.rollback()
            logger.error(f"Erreur création portefeuille: {e}", exc_info=True)
            raise HTTPException(500, "Erreur lors de la création du portefeuille")
    return portfolio


@router.post("/transactions")
async def add_transaction(
    data: TransactionCreate,
    session: AsyncSession = Depends(get_session)
):
    """
    Enregistre un achat ou une vente.
    Met à jour la position automatiquement.
    """
    if data.type not in ("buy", "sell"):
        raise HTTPException(400, "type doit être 'buy' ou 'sell'")
    if data.quantity <= 0:
        raise HTTPException(400, "quantity doit être > 0")
    if data.price <= 0:
        raise HTTPException(400, "price doit être > 0")

    ticker = data.ticker.upper()
    portfolio = await _get_or_create_portfolio(session)

    # Récupérer ou créer l'entreprise
    result = await session.exec(select(Company).where(Company.ticker == ticker))
    company = result.first()
    if not company:
        # Essai yfinance — si rate-limité ou indisponible, on crée quand même avec le ticker comme nom
        info = data_service.get_company_info(ticker)
        company = Company(
            ticker=ticker,
            name=info.get("longName") or info.get("shortName") or ticker,
            exchange=info.get("exchange"),
            sector=info.get("sector"),
            industry=info.get("industry"),
            country=info.get("country"),
            currency=info.get("currency"),
            last_updated=datetime.utcnow(),
        )
        session.add(company)
        await session.flush()

    # Enregistrer la transaction
    tx = Transaction(
        portfolio_id=portfolio.id,
        company_id=company.id,
        type=data.type,
        quantity=data.quantity,
        price=data.price,
        fees=data.fees,
        date=data.date or datetime.utcnow(),
        note=data.note,
    )
    session.add(tx)

    # Mettre à jour la position
    pos_result = await session.exec(
        select(Position)
        .where(Position.portfolio_id == portfolio.id)
        .where(Position.company_id == company.id)
    )
    position = pos_result.first()

    if data.type == "buy":
        if position:
            # Recalcul du coût moyen pondéré
            total_cost = position.quantity * position.avg_cost + data.quantity * data.price
            total_qty = position.quantity + data.quantity
            if total_qty == 0:
                raise HTTPException(400, "Quantité totale ne peut pas être zéro")
            position.avg_cost = total_cost / total_qty
            position.quantity = total_qty
        else:
            position = Position(
                portfolio_id=portfolio.id,
                company_id=company.id,
                quantity=data.quantity,
                avg_cost=data.price,
                currency=portfolio.currency,
            )
            session.add(position)
    elif data.type == "sell":
        if not position or position.quantity < data.quantity:
            raise HTTPException(400, "Quantité vendue supérieure à la position")
        position.quantity -= data.quantity
        if position.quantity == 0:
            await session.delete(position)

    try:
        await session.commit()
    except (IntegrityError, Exception) as e:
        await session.rollback()
        logger.error(f"Erreur enregistrement transaction {ticker}: {e}", exc_info=True)
        raise HTTPException(500, "Erreur lors de l'enregistrement de la transaction")
    return {"status": "ok", "transaction": tx}


@router.get("/positions")
async def get_positions(session: AsyncSession = Depends(get_session)):
    """
    Positions ouvertes avec P&L en temps réel.
    Calcule le coût total, la valeur de marché et le gain/perte.
    """
    portfolio = await _get_or_create_portfolio(session)

    result = await session.exec(
        select(Position, Company)
        .join(Company, Position.company_id == Company.id)
        .where(Position.portfolio_id == portfolio.id)
    )

    positions = []
    total_cost = 0
    total_value = 0

    for position, company in result:
        current_price = data_service.get_current_price(company.ticker)
        changes = data_service.get_price_changes(company.ticker) if current_price else {}

        cost_basis = position.quantity * position.avg_cost
        market_value = position.quantity * current_price if current_price else None
        pnl = market_value - cost_basis if market_value else None
        pnl_pct = (pnl / cost_basis * 100) if (pnl is not None and cost_basis > 0) else None

        total_cost += cost_basis
        if market_value:
            total_value += market_value

        positions.append({
            "ticker": company.ticker,
            "name": company.name,
            "sector": company.sector,
            "quantity": position.quantity,
            "avg_cost": position.avg_cost,
            "current_price": current_price,
            "cost_basis": round(cost_basis, 2),
            "market_value": round(market_value, 2) if market_value else None,
            "pnl": round(pnl, 2) if pnl else None,
            "pnl_pct": round(pnl_pct, 2) if pnl_pct else None,
            "change_1d": changes.get("change_1d"),
            "pct_from_52w_high": changes.get("pct_from_52w_high"),
        })

    # Trier par valeur de marché décroissante
    positions.sort(key=lambda x: x.get("market_value") or 0, reverse=True)

    # Exposition sectorielle
    sector_exposure = {}
    for p in positions:
        sector = p.get("sector") or "Non classé"
        value = p.get("market_value") or 0
        sector_exposure[sector] = sector_exposure.get(sector, 0) + value

    return {
        "portfolio": portfolio.name,
        "currency": portfolio.currency,
        "total_cost": round(total_cost, 2),
        "total_value": round(total_value, 2),
        "total_pnl": round(total_value - total_cost, 2) if total_value else None,
        "total_pnl_pct": round((total_value - total_cost) / total_cost * 100, 2)
                         if (total_value and total_cost > 0) else None,
        "position_count": len(positions),
        "positions": positions,
        "sector_exposure": {
            k: {"value": round(v, 2), "weight": round(v / total_value * 100, 1) if total_value else 0}
            for k, v in sorted(sector_exposure.items(), key=lambda x: x[1], reverse=True)
        }
    }


@router.post("/positions/{ticker}/thesis")
async def save_thesis(
    ticker: str,
    data: ThesisCreate,
    session: AsyncSession = Depends(get_session)
):
    """Écrit ou met à jour la thèse d'investissement d'une position."""
    ticker = ticker.upper()
    portfolio = await _get_or_create_portfolio(session)

    company_result = await session.exec(select(Company).where(Company.ticker == ticker))
    company = company_result.first()
    if not company:
        raise HTTPException(404, f"Entreprise '{ticker}' introuvable en base")

    pos_result = await session.exec(
        select(Position)
        .where(Position.portfolio_id == portfolio.id)
        .where(Position.company_id == company.id)
    )
    position = pos_result.first()
    if not position:
        raise HTTPException(404, f"Pas de position ouverte sur '{ticker}'")

    thesis_result = await session.exec(
        select(InvestmentThesis).where(InvestmentThesis.position_id == position.id)
    )
    thesis = thesis_result.first()

    if thesis:
        thesis.thesis = data.thesis
        thesis.catalysts = data.catalysts
        thesis.risks = data.risks
        thesis.horizon = data.horizon
        thesis.conviction = data.conviction
        thesis.invalidation_conditions = data.invalidation_conditions
        thesis.updated_at = datetime.utcnow()
    else:
        thesis = InvestmentThesis(
            position_id=position.id,
            thesis=data.thesis,
            catalysts=data.catalysts,
            risks=data.risks,
            horizon=data.horizon,
            conviction=data.conviction,
            invalidation_conditions=data.invalidation_conditions,
        )
        session.add(thesis)

    try:
        await session.commit()
        await session.refresh(thesis)
    except (IntegrityError, Exception) as e:
        await session.rollback()
        logger.error(f"Erreur sauvegarde thèse {ticker}: {e}", exc_info=True)
        raise HTTPException(500, "Erreur lors de la sauvegarde de la thèse")
    return thesis


@router.get("/positions/{ticker}/thesis")
async def get_thesis(ticker: str, session: AsyncSession = Depends(get_session)):
    """Lit la thèse d'investissement d'une position."""
    ticker = ticker.upper()
    portfolio = await _get_or_create_portfolio(session)

    company_result = await session.exec(select(Company).where(Company.ticker == ticker))
    company = company_result.first()
    if not company:
        raise HTTPException(404, f"Entreprise '{ticker}' introuvable")

    pos_result = await session.exec(
        select(Position)
        .where(Position.portfolio_id == portfolio.id)
        .where(Position.company_id == company.id)
    )
    position = pos_result.first()
    if not position:
        raise HTTPException(404, f"Pas de position sur '{ticker}'")

    thesis_result = await session.exec(
        select(InvestmentThesis).where(InvestmentThesis.position_id == position.id)
    )
    thesis = thesis_result.first()
    if not thesis:
        raise HTTPException(404, "Aucune thèse écrite pour cette position")

    return thesis


@router.delete("/positions/{ticker}")
async def delete_position(ticker: str, session: AsyncSession = Depends(get_session)):
    """
    Supprime une position et son historique lié (thèse).
    Utiliser pour corriger une erreur de saisie ou clôturer manuellement.
    """
    ticker = ticker.upper()
    portfolio = await _get_or_create_portfolio(session)

    company_result = await session.exec(select(Company).where(Company.ticker == ticker))
    company = company_result.first()
    if not company:
        raise HTTPException(404, f"Entreprise '{ticker}' introuvable")

    pos_result = await session.exec(
        select(Position)
        .where(Position.portfolio_id == portfolio.id)
        .where(Position.company_id == company.id)
    )
    position = pos_result.first()
    if not position:
        raise HTTPException(404, f"Pas de position sur '{ticker}'")

    # Supprimer la thèse liée si elle existe
    thesis_result = await session.exec(
        select(InvestmentThesis).where(InvestmentThesis.position_id == position.id)
    )
    thesis = thesis_result.first()
    if thesis:
        await session.delete(thesis)

    await session.delete(position)
    try:
        await session.commit()
    except (IntegrityError, Exception) as e:
        await session.rollback()
        logger.error(f"Erreur suppression position {ticker}: {e}", exc_info=True)
        raise HTTPException(500, "Erreur lors de la suppression de la position")
    return {"status": "ok", "message": f"Position {ticker} supprimée"}


@router.get("/transactions")
async def get_transactions(session: AsyncSession = Depends(get_session)):
    """Historique complet des transactions."""
    portfolio = await _get_or_create_portfolio(session)
    result = await session.exec(
        select(Transaction, Company)
        .join(Company, Transaction.company_id == Company.id)
        .where(Transaction.portfolio_id == portfolio.id)
        .order_by(Transaction.date.desc())
    )
    return [
        {
            "id": tx.id,
            "ticker": company.ticker,
            "name": company.name,
            "type": tx.type,
            "quantity": tx.quantity,
            "price": tx.price,
            "fees": tx.fees,
            "total": round(tx.quantity * tx.price + tx.fees, 2),
            "date": tx.date,
            "note": tx.note,
        }
        for tx, company in result
    ]
