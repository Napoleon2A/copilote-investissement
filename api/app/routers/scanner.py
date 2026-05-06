"""
Routes : scanner de marché
  GET  /scanner/opportunities   → résultats du dernier scan (cache immédiat)
  POST /scanner/refresh         → déclenche un nouveau scan en background
  GET  /scanner/universe        → liste des tickers dans l'univers scanné
  POST /scanner/custom          → scanner une liste de tickers personnalisée
"""
from fastapi import APIRouter, Depends, Query
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from datetime import datetime

from app.database import get_session
from app.models import Position, Portfolio, Company, SeenOpportunity
from app.services.scanner import (
    run_scan, scan_ticker, SCAN_UNIVERSE, run_macro_scan,
    get_cached_opportunities, is_cache_fresh, trigger_background_scan,
)

router = APIRouter(prefix="/scanner", tags=["scanner"])


@router.get("/opportunities")
async def get_opportunities(
    max_results: int = Query(default=10, ge=1, le=20),
    min_score: float = Query(default=6.0, ge=0, le=10),
    session: AsyncSession = Depends(get_session),
):
    """
    Retourne les opportunités depuis le cache (réponse immédiate).
    Si le cache est périmé ou absent, déclenche un scan en background.
    Utiliser POST /scanner/refresh pour forcer un re-scan.
    """
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

    cache = get_cached_opportunities()
    opportunities = cache["opportunities"]
    computed_at = cache["computed_at"]
    is_running = cache["is_running"]

    # Pas de cache — lancer le premier scan en background
    if opportunities is None:
        if not is_running:
            trigger_background_scan(exclude_tickers=excluded, max_results=max_results)
        return {
            "count": 0,
            "scanning": True,
            "is_refreshing": True,
            "message": "Scan en cours, résultats disponibles dans ~30-60 secondes.",
            "computed_at": None,
            "universe_size": sum(len(v) for v in SCAN_UNIVERSE.values()),
            "opportunities": [],
        }

    # Cache périmé — relancer en background, servir quand même le cache
    if not is_cache_fresh() and not is_running:
        trigger_background_scan(exclude_tickers=excluded, max_results=max_results)

    # Filtrer par score si demandé
    filtered = [o for o in opportunities if o["scores"]["composite"] >= min_score]

    # Tagging historique (nouvelles opportunités vs récurrentes)
    for opp in filtered:
        t = opp["ticker"]
        result = await session.exec(
            select(SeenOpportunity).where(SeenOpportunity.ticker == t)
        )
        seen = result.first()
        if seen:
            opp["new_opportunity"] = False
            opp["first_seen_at"] = seen.first_seen_at.isoformat()
            opp["times_seen"] = seen.times_seen + 1
        else:
            opp["new_opportunity"] = True
            opp["first_seen_at"] = computed_at.isoformat() if computed_at else None
            opp["times_seen"] = 1

    return {
        "count": len(filtered),
        "scanning": False,
        "is_refreshing": is_running,
        "cached": True,
        "computed_at": computed_at.isoformat() if computed_at else None,
        "cache_age_minutes": round((datetime.utcnow() - computed_at).total_seconds() / 60, 1) if computed_at else None,
        "min_score_applied": min_score,
        "excluded_tickers": excluded,
        "universe_size": sum(len(v) for v in SCAN_UNIVERSE.values()),
        "opportunities": filtered,
    }


@router.get("/status")
async def scanner_status():
    """
    État léger du scanner pour polling frontend (pas besoin de DB session).
    Permet au bouton "Relancer" de remplacer un setTimeout 60s rigide par un
    poll qui sait vraiment quand le scan est terminé.
    """
    cache = get_cached_opportunities()
    computed_at = cache["computed_at"]
    is_running = cache["is_running"]
    return {
        "is_refreshing": is_running,
        "has_results": cache["opportunities"] is not None,
        "count": len(cache["opportunities"]) if cache["opportunities"] is not None else 0,
        "computed_at": computed_at.isoformat() if computed_at else None,
        "cache_age_seconds": (
            int((datetime.utcnow() - computed_at).total_seconds())
            if computed_at else None
        ),
        "universe_size": sum(len(v) for v in SCAN_UNIVERSE.values()),
    }


@router.post("/refresh")
async def refresh_opportunities(
    max_results: int = Query(default=10, ge=1, le=20),
    session: AsyncSession = Depends(get_session),
):
    """Déclenche un re-scan en background. Retourne immédiatement."""
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

    started = trigger_background_scan(exclude_tickers=excluded, max_results=max_results)
    return {
        "started": started,
        "message": "Scan lancé en background." if started else "Un scan est déjà en cours.",
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
    """Analyse macro : performance sectorielle, régime de risque, indices clés."""
    return run_macro_scan()


@router.post("/custom")
async def scan_custom(tickers: list[str]):
    """Scanner une liste de tickers personnalisée. Max 20 tickers."""
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

    results.sort(key=lambda x: x.get("scores", {}).get("composite", 0), reverse=True)
    return {"count": len(results), "results": results}
