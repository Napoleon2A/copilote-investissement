"""
Routes : agrégateur de news RSS gratuites.
  GET  /news/macro              → news macro/géopolitique/réglementaire
  GET  /news/linked?tickers=... → news touchant les tickers donnés
  GET  /news/all                → tous les articles agrégés
  POST /news/refresh            → relance le refresh en background
"""
from fastapi import APIRouter, Query

from app.services.rss_aggregator import (
    get_cached_news, is_cache_fresh, trigger_background_refresh, RSS_SOURCES,
    fetch_news_for_tickers,
)

router = APIRouter(prefix="/news", tags=["news"])


@router.get("/all")
async def get_all_news(limit: int = Query(default=30, ge=1, le=100)):
    """Tous les articles RSS agrégés (cache, réponse immédiate)."""
    cache = get_cached_news()
    articles = cache["articles"]

    if not articles and not cache["is_running"]:
        trigger_background_refresh()

    if not is_cache_fresh() and not cache["is_running"]:
        trigger_background_refresh()

    return {
        "count": len(articles),
        "computed_at": cache["computed_at"].isoformat() if cache["computed_at"] else None,
        "is_refreshing": cache["is_running"],
        "sources": [s["name"] for s in RSS_SOURCES],
        "articles": articles[:limit],
    }


@router.get("/macro")
async def get_macro_news(limit: int = Query(default=15, ge=1, le=50)):
    """News macro / géopolitique / réglementaire / sectoriel."""
    cache = get_cached_news()
    articles = cache["articles"]

    if not articles and not cache["is_running"]:
        trigger_background_refresh()
    if not is_cache_fresh() and not cache["is_running"]:
        trigger_background_refresh()

    macro = [a for a in articles if a["category"] in ("macro", "geopolitical", "regulatory", "sector")]

    return {
        "count": len(macro),
        "computed_at": cache["computed_at"].isoformat() if cache["computed_at"] else None,
        "is_refreshing": cache["is_running"],
        "scanning": len(articles) == 0,
        "articles": macro[:limit],
    }


@router.get("/linked")
async def get_linked_news(
    tickers: str = Query(..., description="Tickers séparés par virgule, ex: AAPL,EOSE"),
    limit: int = Query(default=15, ge=1, le=50),
):
    """News dont le titre/résumé mentionne au moins un des tickers donnés."""
    target = {t.strip().upper() for t in tickers.split(",") if t.strip()}
    if not target:
        return {"count": 0, "articles": []}

    cache = get_cached_news()
    articles = cache["articles"]

    if not articles and not cache["is_running"]:
        trigger_background_refresh()
    if not is_cache_fresh() and not cache["is_running"]:
        trigger_background_refresh()

    linked = [
        a for a in articles
        if any(t in target for t in a.get("tickers_mentioned", []))
    ]

    return {
        "count": len(linked),
        "computed_at": cache["computed_at"].isoformat() if cache["computed_at"] else None,
        "is_refreshing": cache["is_running"],
        "scanning": len(articles) == 0,
        "tickers_queried": sorted(target),
        "articles": linked[:limit],
    }


@router.get("/per-ticker")
async def get_per_ticker_news(
    tickers: str = Query(..., description="Tickers séparés par virgule, ex: AAPL,EOSE,NVDA"),
    max_per_ticker: int = Query(default=5, ge=1, le=15),
):
    """
    Fetch Google News (RSS gratuit) pour chaque ticker individuellement.
    Permet de couvrir les small-caps que les médias généralistes ne traitent pas.
    Cache 30 min par ticker pour éviter rate limiting.
    """
    tickers_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    if not tickers_list:
        return {"count": 0, "articles": []}

    articles = fetch_news_for_tickers(tickers_list, max_per_ticker=max_per_ticker)

    return {
        "count": len(articles),
        "tickers_queried": tickers_list,
        "articles": articles,
    }


@router.post("/refresh")
async def refresh_news():
    """Force un refresh des news en background."""
    started = trigger_background_refresh()
    return {
        "started": started,
        "message": "Refresh lancé." if started else "Un refresh est déjà en cours.",
    }
