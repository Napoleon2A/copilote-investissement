"""
RSS Aggregator — Agrégation de news macro/géopolitique depuis RSS publics GRATUITS.

Sources RSS publiques (aucune clé API, aucun coût, aucun abonnement) :
  - Les Échos (FR)
  - Boursorama (FR)
  - Le Monde Économie (FR)
  - CNBC Markets (US)
  - MarketWatch (US)
  - Yahoo Finance (US)
  - Investing.com

Cache en mémoire, refresh toutes les 15 min en background.
Classification : macro / geopolitical / regulatory / sector / company.
"""
import logging
import threading
import time
import urllib.parse
from datetime import datetime, timezone
from typing import Optional

try:
    import feedparser  # type: ignore
except ImportError:
    feedparser = None

logger = logging.getLogger(__name__)

# ── Sources RSS gratuites ─────────────────────────────────────────────────
RSS_SOURCES: list[dict] = [
    # 🇫🇷 Français
    {"name": "Les Échos · Finance",       "url": "https://services.lesechos.fr/rss/les-echos-finance-marches.xml",       "lang": "fr", "weight": 3},
    {"name": "Les Échos · Économie",      "url": "https://services.lesechos.fr/rss/les-echos-economie.xml",              "lang": "fr", "weight": 3},
    {"name": "Boursorama",                "url": "https://www.boursorama.com/rss/news/all/news.xml",                     "lang": "fr", "weight": 2},
    {"name": "Le Monde · Économie",       "url": "https://www.lemonde.fr/economie/rss_full.xml",                         "lang": "fr", "weight": 2},

    # 🇬🇧 Anglais
    {"name": "CNBC · Markets",            "url": "https://www.cnbc.com/id/100003114/device/rss/rss.html",                "lang": "en", "weight": 3},
    {"name": "CNBC · Economy",            "url": "https://www.cnbc.com/id/20910258/device/rss/rss.html",                 "lang": "en", "weight": 3},
    {"name": "MarketWatch · Top Stories", "url": "https://feeds.content.dowjones.io/public/rss/mw_topstories",           "lang": "en", "weight": 2},
    {"name": "Yahoo Finance",             "url": "https://finance.yahoo.com/news/rssindex",                              "lang": "en", "weight": 2},
    {"name": "Investing.com · Economy",   "url": "https://www.investing.com/rss/news_25.rss",                            "lang": "en", "weight": 2},
]

# ── Classification ────────────────────────────────────────────────────────
KEYWORDS = {
    "macro": [
        "fed", "fmi", "bce", "banque centrale", "taux", "inflation", "récession", "pib",
        "chômage", "déficit", "dette publique", "stagflation", "powell", "lagarde",
        "federal reserve", "interest rate", "rate cut", "rate hike", "cpi", "ppi",
        "ecb", "boe", "central bank", "gdp", "unemployment", "jobs report",
        "nonfarm", "payrolls", "recession", "fomc",
    ],
    "geopolitical": [
        "guerre", "conflit", "tarif", "douanier", "sanctions", "géopolit",
        "russie", "ukraine", "israël", "iran", "chine", "taïwan", "élection",
        "cessez-le-feu", "embargo",
        "war", "tariff", "trade war", "geopolit",
        "russia", "china", "ukraine", "israel", "iran", "election", "ceasefire",
        "embargo", "treaty",
    ],
    "regulatory": [
        "régulation", "régulateur", "loi", "antitrust", "amende", "enquête",
        "tribunal", "interdiction", "approbation", "commission européenne", "amf",
        "regulation", "regulator", "law", "doj", "ftc", "sec",
        "investigation", "fine", "lawsuit", "court", "ruling", "ban", "approval",
    ],
    "sector": [
        "secteur", "industrie", "automobile", "luxe", "pétrole", "gaz",
        "renouvelable", "solaire", "éolien", "ia", "intelligence artificielle",
        "semiconducteur", "puce", "biotech", "pharma", "défense",
        "sector", "industry", "ai", "artificial intelligence", "semiconductor",
        "chip", "biotech", "pharma", "energy", "oil", "gas", "renewable",
        "solar", "wind", "automotive", "luxury", "defense",
    ],
}


def classify_news(title: str, summary: str = "") -> str:
    text = f"{title} {summary}".lower()
    for category, kws in KEYWORDS.items():
        if any(kw in text for kw in kws):
            return category
    return "company"


# ── Détection des tickers ─────────────────────────────────────────────────
TICKER_NAME_MAP: dict[str, list[str]] = {
    "AAPL":  ["apple", "iphone", "ipad", "tim cook"],
    "MSFT":  ["microsoft", "azure", "satya nadella"],
    "GOOGL": ["alphabet", "google", "youtube", "android", "sundar pichai"],
    "GOOG":  ["alphabet", "google"],
    "AMZN":  ["amazon", "aws", "andy jassy", "jeff bezos"],
    "META":  ["meta platforms", "facebook", "instagram", "whatsapp", "zuckerberg"],
    "TSLA":  ["tesla", "elon musk"],
    "NVDA":  ["nvidia", "jensen huang"],
    "AMD":   ["amd", "advanced micro"],
    "INTC":  ["intel"],
    "TSM":   ["tsmc", "taiwan semi"],
    "ASML":  ["asml"],
    "MU":    ["micron"],
    "AVGO":  ["broadcom"],
    "ORCL":  ["oracle"],
    "CRM":   ["salesforce", "marc benioff"],
    "ADBE":  ["adobe"],
    "NOW":   ["servicenow"],
    "JPM":   ["jpmorgan", "jp morgan"],
    "GS":    ["goldman sachs"],
    "V":     ["visa inc"],
    "MA":    ["mastercard"],
    "AXP":   ["american express"],
    "BRK-B": ["berkshire", "warren buffett"],
    "LLY":   ["eli lilly", "lilly"],
    "UNH":   ["unitedhealth", "united health"],
    "ABBV":  ["abbvie"],
    "MRK":   ["merck"],
    "AMGN":  ["amgen"],
    "GILD":  ["gilead"],
    "MRNA":  ["moderna"],
    "XOM":   ["exxon", "exxonmobil"],
    "CVX":   ["chevron"],
    "COP":   ["conocophillips"],
    "FSLR":  ["first solar"],
    "ENPH":  ["enphase"],
    "EOSE":  ["eos energy"],
    "NKE":   ["nike"],
    "COST":  ["costco"],
    "HD":    ["home depot"],
    "WMT":   ["walmart"],
    "PG":    ["procter & gamble", "procter and gamble"],
    "KO":    ["coca-cola", "coca cola"],
    "PEP":   ["pepsi", "pepsico"],
    "RTX":   ["raytheon"],
    "LMT":   ["lockheed martin", "lockheed"],
    "BA":    ["boeing"],
    "GE":    ["ge aerospace", "general electric"],
    "CAT":   ["caterpillar"],
    "DE":    ["john deere"],
    "BABA":  ["alibaba"],
    "PDD":   ["pinduoduo", "temu"],
    "NU":    ["nubank"],
    "PLTR":  ["palantir"],
    "HOOD":  ["robinhood"],
    "SOFI":  ["sofi"],
    "NEM":   ["newmont"],
    "FCX":   ["freeport"],
    "VALE":  ["vale s.a"],
    "MC.PA": ["lvmh", "louis vuitton"],
    "AIR.PA": ["airbus"],
    "OR.PA":  ["l'oréal", "loreal"],
    "TTE.PA": ["totalenergies", "totalenergie"],
    "SAP":    ["sap se"],
    "BNP.PA": ["bnp paribas"],
    "SAN.PA": ["sanofi"],
}

_NAME_TO_TICKER: dict[str, str] = {}
for ticker, names in TICKER_NAME_MAP.items():
    for n in names:
        _NAME_TO_TICKER[n.lower()] = ticker


def detect_tickers(text: str) -> list[str]:
    text_lower = text.lower()
    found = set()
    for name, ticker in _NAME_TO_TICKER.items():
        if name in text_lower:
            found.add(ticker)
    return sorted(found)


# ── Cache en mémoire ──────────────────────────────────────────────────────
CACHE_TTL_SECONDS = 900  # 15 min

_cache: dict = {
    "articles": [],
    "computed_at": None,
    "is_running": False,
    "last_error": None,
}
_lock = threading.Lock()


def _parse_published(entry) -> Optional[str]:
    for key in ("published_parsed", "updated_parsed"):
        if hasattr(entry, key) and getattr(entry, key):
            try:
                t = getattr(entry, key)
                dt = datetime(*t[:6], tzinfo=timezone.utc)
                return dt.isoformat()
            except Exception:
                continue
    return None


def _fetch_one_feed(source: dict) -> list[dict]:
    if feedparser is None:
        logger.error("feedparser non installé. pip install feedparser.")
        return []
    try:
        feed = feedparser.parse(source["url"])
        articles = []
        for entry in feed.entries[:20]:
            title = (getattr(entry, "title", "") or "").strip()
            if not title:
                continue
            summary = (getattr(entry, "summary", "") or getattr(entry, "description", "") or "")[:300]
            # Nettoyer le HTML basique
            import re
            summary = re.sub(r"<[^>]+>", "", summary).strip()

            link = getattr(entry, "link", "")
            published = _parse_published(entry)

            text_full = f"{title} {summary}"
            category = classify_news(title, summary)
            tickers_mentioned = detect_tickers(text_full)

            articles.append({
                "title": title,
                "summary": summary[:200],
                "link": link,
                "publisher": source["name"],
                "lang": source["lang"],
                "weight": source["weight"],
                "published": published,
                "category": category,
                "tickers_mentioned": tickers_mentioned,
            })
        return articles
    except Exception as e:
        logger.warning(f"RSS aggregator: erreur sur {source['name']}: {e}")
        return []


def fetch_all_feeds() -> list[dict]:
    all_articles = []
    for source in RSS_SOURCES:
        articles = _fetch_one_feed(source)
        all_articles.extend(articles)

    # Déduplication par début de titre
    seen = set()
    deduped = []
    for art in all_articles:
        key = art["title"][:60].lower().strip()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(art)

    # Tri : récent d'abord, puis par poids
    deduped.sort(key=lambda a: (a["published"] or "", a["weight"]), reverse=True)
    return deduped


def get_cached_news() -> dict:
    with _lock:
        return {
            "articles": list(_cache["articles"]),
            "computed_at": _cache["computed_at"],
            "is_running": _cache["is_running"],
            "last_error": _cache["last_error"],
        }


def is_cache_fresh() -> bool:
    with _lock:
        if _cache["computed_at"] is None:
            return False
        age = (datetime.utcnow() - _cache["computed_at"]).total_seconds()
        return age < CACHE_TTL_SECONDS


# ──────────────────────────────────────────────────────────────────────────
# Google News par ticker — RSS gratuit qui couvre TOUTES les sociétés (small-caps incluses)
# ──────────────────────────────────────────────────────────────────────────
PER_TICKER_TTL_SECONDS = 1800  # 30 min de cache par ticker
_per_ticker_cache: dict[str, dict] = {}
_per_ticker_lock = threading.Lock()


def _build_google_news_url(ticker: str, name: str | None = None, lang: str = "en") -> str:
    """Construit l'URL Google News RSS pour un ticker."""
    if name and name.lower() != ticker.lower():
        query = f'"{ticker}" OR "{name}"'
    else:
        query = f'"{ticker}"'
    encoded = urllib.parse.quote(query)
    if lang == "fr":
        return f"https://news.google.com/rss/search?q={encoded}&hl=fr&gl=FR&ceid=FR:fr"
    return f"https://news.google.com/rss/search?q={encoded}&hl=en&gl=US&ceid=US:en"


def fetch_google_news_for_ticker(ticker: str, max_articles: int = 10) -> list[dict]:
    """Fetch Google News RSS pour un ticker spécifique."""
    if feedparser is None:
        return []
    ticker_up = ticker.upper()

    # Récupérer le nom de la société depuis le mapping
    names = TICKER_NAME_MAP.get(ticker_up, [])
    name = names[0] if names else None

    url = _build_google_news_url(ticker_up, name=name, lang="en")

    try:
        feed = feedparser.parse(url)
        articles = []
        for entry in feed.entries[:max_articles]:
            raw_title = (getattr(entry, "title", "") or "").strip()
            if not raw_title:
                continue

            link = getattr(entry, "link", "")
            published = _parse_published(entry)

            # Google News format: "Title - Publisher"
            title = raw_title
            publisher = "Google News"
            if " - " in raw_title:
                parts = raw_title.rsplit(" - ", 1)
                if len(parts) == 2 and len(parts[1]) < 60:
                    title = parts[0].strip()
                    publisher = parts[1].strip()

            category = classify_news(title)
            mentioned = detect_tickers(title)
            if ticker_up not in mentioned:
                mentioned.append(ticker_up)

            articles.append({
                "title": title,
                "summary": "",
                "link": link,
                "publisher": publisher,
                "lang": "en",
                "weight": 2,
                "published": published,
                "category": category,
                "tickers_mentioned": mentioned,
                "source_type": "google_news_ticker",
                "queried_ticker": ticker_up,
            })
        return articles
    except Exception as e:
        logger.warning(f"Google News {ticker_up}: {e}")
        return []


def get_ticker_news_cached(ticker: str) -> list[dict]:
    """Cache 30 min par ticker pour éviter rate limiting Google."""
    ticker_up = ticker.upper()
    with _per_ticker_lock:
        cached = _per_ticker_cache.get(ticker_up)
        if cached:
            age = (datetime.utcnow() - cached["computed_at"]).total_seconds()
            if age < PER_TICKER_TTL_SECONDS:
                return cached["articles"]

    # Pas en cache ou périmé : fetch (hors lock)
    articles = fetch_google_news_for_ticker(ticker_up)

    with _per_ticker_lock:
        _per_ticker_cache[ticker_up] = {
            "articles": articles,
            "computed_at": datetime.utcnow(),
        }
    return articles


def fetch_news_for_tickers(tickers: list[str], max_per_ticker: int = 5) -> list[dict]:
    """Fetch Google News pour plusieurs tickers, déduplique et trie par date."""
    all_articles = []
    seen_links = set()
    seen_titles = set()

    for t in tickers[:15]:  # max 15 tickers pour limiter les appels
        articles = get_ticker_news_cached(t)
        for a in articles[:max_per_ticker]:
            link = a.get("link", "")
            title_key = (a.get("title", "")[:50]).lower()
            if link in seen_links or title_key in seen_titles:
                continue
            seen_links.add(link)
            seen_titles.add(title_key)
            all_articles.append(a)

    all_articles.sort(key=lambda a: a.get("published") or "", reverse=True)
    return all_articles


def trigger_background_refresh() -> bool:
    with _lock:
        if _cache["is_running"]:
            return False
        _cache["is_running"] = True

    def _run():
        try:
            logger.info("RSS aggregator: refresh démarré...")
            time.sleep(2)
            articles = fetch_all_feeds()
            with _lock:
                _cache["articles"] = articles
                _cache["computed_at"] = datetime.utcnow()
                _cache["last_error"] = None
            logger.info(f"RSS aggregator: {len(articles)} articles agrégés depuis {len(RSS_SOURCES)} sources.")
        except Exception as e:
            logger.error(f"RSS aggregator: erreur — {e}")
            with _lock:
                _cache["last_error"] = str(e)
        finally:
            with _lock:
                _cache["is_running"] = False

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    return True
