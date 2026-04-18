"""
Routes : scanner de marché
  GET  /scanner/opportunities          → top opportunités détectées maintenant
  GET  /scanner/universe               → liste des tickers dans l'univers scanné
  POST /scanner/custom                 → scanner une liste de tickers personnalisée
"""
from fastapi import APIRouter, Depends, Query
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from typing import Optional

from datetime import datetime

from app.database import get_session
from app.models import Position, Portfolio, Company, SeenOpportunity
from app.services.scanner import run_scan, scan_ticker, SCAN_UNIVERSE, run_macro_scan

router = APIRouter(prefix="/scanner", tags=["scanner"])


@router.get("/opportunities")
async def get_opportunities(
    max_results: int = Query(default=10, ge=1, le=20),
    min_score: float = Query(default=6.0, ge=0, le=10),
    session: AsyncSession = Depends(get_session),
):
    """
    Retourne les meilleures opportunités détectées dans l'univers scanné.

    Le scanner analyse ~50 tickers sur plusieurs secteurs et remonte ceux
    dont le score composite dépasse le seuil demandé.

    Note : le premier appel peut prendre 30-60 secondes (fetching yfinance).
    Les données sont ensuite en cache 5-15 min.
    """
    # Récupérer les tickers du portefeuille pour les exclure
    portfolio_result = await session.exec(select(Portfolio))
    portfolio = portfolio_result.first()
    excluded = []
    if portfolio:
        pos_result = await session.exec(
            select(Company)
            .join(Position, Position.company_id == Company.id)
            .where(Position.portfolio_id == portfolio.id)
        )
        excluded = [c.ticker for c in pos_result.all()]

    opportunities = run_scan(
        exclude_tickers=excluded,
        max_results=max_results,
    )

    # Filtrer par score minimum si différent du défaut
    if min_score != 6.0:
        opportunities = [o for o in opportunities if o["scores"]["composite"] >= min_score]

    # Tagging historique : distinguer nouvelles opportunités des récurrentes
    for opp in opportunities:
        t = opp["ticker"]
        result = await session.exec(
            select(SeenOpportunity).where(SeenOpportunity.ticker == t)
        )
        seen = result.first()
        if seen:
            opp["new_opportunity"] = False
            opp["first_seen_at"] = seen.first_seen_at.isoformat()
            opp["times_seen"] = seen.times_seen + 1
            seen.last_seen_at = datetime.utcnow()
            seen.times_seen += 1
            seen.last_score = opp["scores"]["composite"]
            session.add(seen)
        else:
            opp["new_opportunity"] = True
            opp["first_seen_at"] = datetime.utcnow().isoformat()
            opp["times_seen"] = 1
            session.add(SeenOpportunity(
                ticker=t,
                last_score=opp["scores"]["composite"],
            ))

    await session.commit()

    return {
        "count": len(opportunities),
        "min_score_applied": min_score,
        "excluded_tickers": excluded,
        "universe_size": sum(len(v) for v in SCAN_UNIVERSE.values()),
        "opportunities": opportunities,
    }


@router.get("/universe")
async def get_universe():
    """Liste des tickers dans l'univers scanné, par secteur."""
    return {
        "total": sum(len(v) for v in SCAN_UNIVERSE.values()),
        "sectors": {
            sector: {"count": len(tickers), "tickers": tickers}
            for sector, tickers in SCAN_UNIVERSE.items()
        },
    }


@router.get("/macro")
async def get_macro_scan():
    """
    Analyse macro : performance sectorielle, régime de risque, indices clés.
    Retourne une vue d'ensemble du marché pour contextualiser les opportunités.
    """
    return run_macro_scan()


@router.post("/custom")
async def scan_custom(tickers: list[str]):
    """
    Scanner une liste de tickers personnalisée.
    Utile pour évaluer rapidement un panier d'actions.
    Max 20 tickers par appel.
    """
    if len(tickers) > 20:
        tickers = tickers[:20]

    results = []
    for ticker in tickers:
        result = scan_ticker(ticker.upper())
        if result:
            results.append(result)
        else:
            results.append({
                "ticker": ticker.upper(),
                "type": "no_signal",
                "reason": "Score insuffisant ou données indisponibles",
            })

    results.sort(
        key=lambda x: x.get("scores", {}).get("composite", 0),
        reverse=True,
    )
    return {"count": len(results), "results": results}
