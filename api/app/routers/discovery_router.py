"""
Routes : découverte d'opportunités via composition d'ETF thématiques.
  GET /discovery/etf-candidates → univers thématique IA agrégé
  GET /discovery/etf/{ticker}   → top holdings d'un ETF spécifique
"""
from fastapi import APIRouter, Query

from app.services import etf_holdings

router = APIRouter(prefix="/discovery", tags=["discovery"])


@router.get("/etf-candidates")
async def etf_candidates(
    min_etf_count: int = Query(default=1, ge=1, description="Filtre : nb minimum d'ETF où le ticker doit apparaître"),
    limit: int = Query(default=50, ge=1, le=200),
):
    """
    Univers AI value chain agrégé depuis 10 ETF thématiques (AIQ, BOTZ, CHAT,
    ROBO, SOXX, IGV, URNM, URA, NLR, ICLN). Trié par récurrence cross-ETF.

    Un ticker présent dans plusieurs ETF est un signal de pertinence thématique
    plus fort qu'un ticker isolé.
    """
    candidates = etf_holdings.get_unique_candidates()
    filtered = [c for c in candidates if c["etf_count"] >= min_etf_count]
    return {
        "total": len(filtered),
        "etfs_used": list(etf_holdings.THEMED_ETFS.keys()),
        "candidates": filtered[:limit],
    }


@router.get("/etf/{etf_ticker}")
async def etf_top_holdings(etf_ticker: str):
    """
    Top holdings d'un ETF (top 10 typiquement, dépend de yfinance).
    """
    holdings = etf_holdings.get_etf_holdings(etf_ticker)
    return {
        "etf": etf_ticker.upper(),
        "name": etf_holdings.THEMED_ETFS.get(etf_ticker.upper(), ""),
        "count": len(holdings),
        "holdings": holdings,
    }
