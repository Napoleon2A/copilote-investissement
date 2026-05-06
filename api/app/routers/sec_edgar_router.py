"""
Routes : whale watching via SEC EDGAR (13-F filings).
  GET /sec/whales/{ticker}  → super-investisseurs détenant ce ticker
"""
from fastapi import APIRouter, Path, Query
from typing import Optional

from app.services import sec_edgar

router = APIRouter(prefix="/sec", tags=["sec-edgar"])


@router.get("/whales/{ticker}")
async def whales_holding(
    ticker: str = Path(...),
    fallback_name: Optional[str] = Query(default=None, description="Nom utilisé si le ticker n'est pas dans company_tickers SEC"),
):
    """
    Liste les super-investisseurs (Berkshire, Pershing, Bridgewater, ...) qui détiennent ce ticker
    selon leur dernier 13-F. Données trimestrielles avec ~45j de retard.
    """
    return sec_edgar.get_whales_for_ticker(ticker, fallback_name=fallback_name)


@router.get("/whales-batch")
async def whales_batch(
    tickers: str = Query(..., description="Liste de tickers séparés par virgule"),
):
    """
    Version batch : pour une liste de tickers, retourne les whales pour chacun en une seule requête.
    Évite N round-trips HTTP côté frontend.
    """
    out: dict[str, dict] = {}
    for t in [x.strip().upper() for x in tickers.split(",") if x.strip()]:
        out[t] = sec_edgar.get_whales_for_ticker(t)
    return {"count": len(out), "data": out}
