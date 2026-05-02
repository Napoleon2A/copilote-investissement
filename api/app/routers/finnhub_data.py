"""
Routes : données enrichies via Finnhub
  GET /finnhub/economic-calendar     → events macro à venir (Fed, CPI, NFP, ECB, etc.)
  GET /finnhub/insider/{ticker}      → transactions insiders 3 derniers mois
  GET /finnhub/recommendations/{ticker} → distribution analystes par mois
  GET /finnhub/price-target/{ticker} → consensus target
  GET /finnhub/profile/{ticker}      → logo + infos société
  GET /finnhub/news/{ticker}         → news officielles 7 derniers jours
"""
from fastapi import APIRouter, Query, Path
from typing import Optional

from app.services import finnhub_economic, finnhub_ticker

router = APIRouter(prefix="/finnhub", tags=["finnhub"])


@router.get("/economic-calendar")
async def economic_calendar(
    max_days: int = Query(default=15, ge=1, le=60),
    only_high: bool = Query(default=True),
    countries: Optional[str] = Query(default=None, description="ISO codes séparés par virgule (ex: US,EU,FR)"),
):
    """Events macro à venir (Fed meetings, CPI, NFP, GDP, etc.)."""
    countries_list = [c.strip().upper() for c in countries.split(",")] if countries else None
    events = finnhub_economic.get_cached_events(max_days=max_days, only_high=only_high, countries=countries_list)
    return {
        "count": len(events),
        "max_days": max_days,
        "only_high": only_high,
        "countries": countries_list,
        "events": events,
    }


@router.get("/insider/{ticker}")
async def insider_transactions(ticker: str = Path(...)):
    """Achats/ventes des dirigeants des 3 derniers mois."""
    transactions = finnhub_ticker.get_insider_transactions(ticker)
    summary = finnhub_ticker.insider_summary(transactions)
    return {
        "ticker": ticker.upper(),
        "summary": summary,
        "transactions": transactions,
    }


@router.get("/recommendations/{ticker}")
async def recommendations(ticker: str = Path(...)):
    """Distribution analystes par mois."""
    data = finnhub_ticker.get_recommendations(ticker)
    target = finnhub_ticker.get_price_target(ticker)
    return {
        "ticker": ticker.upper(),
        "recommendations": data,
        "price_target": target,
    }


@router.get("/profile/{ticker}")
async def profile(ticker: str = Path(...)):
    """Profile société : logo, nom, secteur, marketCap, exchange, country, weburl."""
    data = finnhub_ticker.get_profile(ticker)
    return {"ticker": ticker.upper(), "profile": data}


@router.get("/news/{ticker}")
async def company_news(
    ticker: str = Path(...),
    days_back: int = Query(default=7, ge=1, le=30),
    limit: int = Query(default=15, ge=1, le=50),
):
    """News officielles Finnhub (titres, summary, source)."""
    news = finnhub_ticker.get_company_news(ticker, days_back=days_back)
    return {
        "ticker": ticker.upper(),
        "count": len(news),
        "news": news[:limit],
    }
