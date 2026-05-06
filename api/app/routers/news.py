"""
Routes : agrégateur de news RSS gratuites.
  GET  /news/macro              → news macro/géopolitique/réglementaire
  GET  /news/linked?tickers=... → news touchant les tickers donnés
  GET  /news/all                → tous les articles agrégés
  POST /news/refresh            → relance le refresh en background
"""
import logging
from fastapi import APIRouter, Query

logger = logging.getLogger(__name__)

from app.services.rss_aggregator import (
    get_cached_news, is_cache_fresh, trigger_background_refresh, RSS_SOURCES,
    fetch_news_for_tickers,
)
from app.services.news_filters import (
    is_blacklisted, is_fresh, jaccard_similarity, title_signature,
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


def _dedup_by_signature(articles: list[dict], jaccard_threshold: float = 0.6) -> list[dict]:
    """Garde un seul article par groupe de titres similaires (signature de tokens).
    L'ordre d'entrée est conservé : le premier vu gagne (utiliser un input déjà trié)."""
    out: list[dict] = []
    out_sigs: list[frozenset[str]] = []
    for art in articles:
        sig = title_signature(art["title"])
        if not sig:
            out.append(art)
            continue
        if any(jaccard_similarity(sig, existing) >= jaccard_threshold for existing in out_sigs):
            continue
        out.append(art)
        out_sigs.append(sig)
    return out


@router.get("/macro")
async def get_macro_news(limit: int = Query(default=20, ge=1, le=50)):
    """
    News macro & géopolitique — approche "qualité par les sources".

    Pipeline simple et robuste :
      1. Sources premium uniquement (macro_quality = high|medium).
      2. Blacklist titres (lifestyle, sport, listicles).
      3. Filtre fraîcheur : < 36 h (sauf si pool trop petit).
      4. Dédup par signature de tokens (Jaccard >= 0.6).
      5. Tri : récent d'abord, puis par poids source.

    Aucune whitelist d'entités → ne rate aucun sujet macro légitime
    publié par les sources sélectionnées.
    """
    cache = get_cached_news()
    articles = cache["articles"]

    if not articles and not cache["is_running"]:
        trigger_background_refresh()
    if not is_cache_fresh() and not cache["is_running"]:
        trigger_background_refresh()

    # 1. Garde les sources premium
    pool = [a for a in articles if a.get("macro_quality") in ("high", "medium")]

    # 2. Coupe la blacklist
    pool = [a for a in pool if not is_blacklisted(a["title"], a.get("summary", ""))]

    # 3. Coupe les vieux articles (>36h). Si pool trop petit, on relâche cette contrainte.
    fresh = [a for a in pool if is_fresh(a.get("published"), max_hours=36)]
    if len(fresh) >= 8:
        pool = fresh
    else:
        logger.info("news/macro: peu d'articles frais (%d), filtre fraîcheur relâché", len(fresh))

    # 5. Tri par récence puis poids source (avant dédup pour que le plus récent gagne)
    pool.sort(key=lambda a: (a["published"] or "", a.get("weight", 1)), reverse=True)

    # 4. Dédup par signature de tokens
    deduped = _dedup_by_signature(pool)

    return {
        "count": len(deduped),
        "computed_at": cache["computed_at"].isoformat() if cache["computed_at"] else None,
        "is_refreshing": cache["is_running"],
        "scanning": len(articles) == 0,
        "total_pool": len(articles),
        "articles": deduped[:limit],
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
