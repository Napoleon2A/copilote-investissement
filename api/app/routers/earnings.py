"""
Routes : Earnings Play — publications de résultats imminentes
  GET  /earnings/upcoming     → résultats dans les 21 prochains jours
"""
from fastapi import APIRouter, Query

from app.services.earnings_service import scan_upcoming_earnings

router = APIRouter(prefix="/earnings", tags=["earnings"])


@router.get("/upcoming")
async def get_upcoming_earnings(
    max_days: int = Query(default=21, ge=1, le=60),
    extra_tickers: str = Query(default="", description="Tickers additionnels (séparés par virgule). Inclut systématiquement les positions/idées hors univers."),
):
    """
    Retourne les entreprises de l'univers scanné + extra_tickers qui publient
    leurs résultats dans les prochains jours, avec analyse pré-earnings.

    Note : le premier appel peut prendre 30-60 secondes (scan complet).
    """
    extra_list = [t.strip() for t in extra_tickers.split(",") if t.strip()] if extra_tickers else []
    results = scan_upcoming_earnings(max_days=max_days, extra_tickers=extra_list)
    return {
        "count": len(results),
        "max_days": max_days,
        "extra_tickers_added": extra_list,
        "earnings": results,
    }
