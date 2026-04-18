"""
Agrégateur de news — agrège les actualités de tous les tickers suivis.

Collecte les news de chaque ticker via yfinance, déduplique par titre,
classe par pertinence (portfolio > watchlist > autres), et retourne
un flux unifié pour le brief quotidien.
"""
import logging
from datetime import datetime

from app.services.data_service import get_news

logger = logging.getLogger(__name__)


def aggregate_news(
    tickers: list[str],
    max_items: int = 15,
    priority_tickers: list[str] | None = None,
) -> list[dict]:
    """
    Agrège les news de tous les tickers donnés.

    Args:
        tickers: liste de tickers à scanner
        max_items: nombre max de news à retourner
        priority_tickers: tickers prioritaires (portfolio), triés en premier

    Returns:
        Liste de dicts {ticker, title, link, publisher, published, priority}
    """
    priority_set = set(priority_tickers or [])
    all_news: list[dict] = []
    seen_titles: set[str] = set()

    for ticker in tickers:
        try:
            raw_news = get_news(ticker, count=5)
            for item in raw_news:
                title = item.get("title", "").strip()
                # Déduplication basique par titre normalisé
                title_key = title.lower()[:60]
                if title_key in seen_titles:
                    continue
                seen_titles.add(title_key)

                all_news.append({
                    "ticker": ticker,
                    "title": title,
                    "link": item.get("link", ""),
                    "publisher": item.get("publisher", ""),
                    "published": item.get("published") or item.get("pubDate"),
                    "priority": 1 if ticker in priority_set else 2,
                })
        except Exception as e:
            logger.warning(f"News aggregation {ticker}: {e}")
            continue

    # Tri : priorité d'abord, puis date de publication (récent en premier)
    def sort_key(n: dict) -> tuple:
        pub = n.get("published")
        try:
            ts = datetime.fromisoformat(str(pub)[:19]).timestamp() if pub else 0
        except (ValueError, TypeError):
            ts = 0
        return (n["priority"], -ts)

    all_news.sort(key=sort_key)
    return all_news[:max_items]
