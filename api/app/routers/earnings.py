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
):
    """
    Retourne les entreprises de l'univers scanné qui publient
    leurs résultats dans les prochains jours, avec analyse pré-earnings.

    Note : le premier appel peut prendre 30-60 secondes (scan complet).
    """
    results = scan_upcoming_earnings(max_days=max_days)
    return {
        "count": len(results),
        "max_days": max_days,
        "earnings": results,
    }
