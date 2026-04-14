"""
Service de données de marché — Provider : yfinance (gratuit)

Ce module est la seule couche qui touche à yfinance.
Si on change de provider un jour, on ne modifie que ce fichier.

Données disponibles avec yfinance :
  - Prix en quasi-temps réel (15 min delay pour US, variable Europe)
  - Historiques OHLCV jusqu'à 20 ans
  - Fondamentaux : P/E, EV/EBITDA, marges, ROE, dette, etc.
  - Info entreprise : secteur, industrie, description, site
  - News récentes (RSS Yahoo Finance)
  - Earnings calendar approximatif

Limites connues :
  - Pas de données intrajournalières fiables au-delà de 60 jours
  - Fondamentaux parfois incomplets ou décalés pour les small caps européennes
  - Pas de données institutionnelles ni d'insider transactions fiables
  - Pas de garantie de SLA — Yahoo peut changer son API sans préavis
"""
import yfinance as yf
import pandas as pd
from datetime import datetime, date, timedelta
from typing import Optional
import logging
import time

logger = logging.getLogger(__name__)

# Cache mémoire simple : évite de re-fetch la même donnée dans la même session.
# Clé = (ticker, type), valeur = (timestamp, data).
# TTL : 15 min pour l'info et les fondamentaux, 5 min pour les prix.
_cache: dict[tuple, tuple[float, object]] = {}
_CACHE_TTL_INFO = 900   # 15 min
_CACHE_TTL_PRICE = 300  # 5 min


def _cache_get(key: tuple, ttl: int):
    entry = _cache.get(key)
    if entry and (time.time() - entry[0]) < ttl:
        return entry[1]
    return None


def _cache_set(key: tuple, value):
    _cache[key] = (time.time(), value)


def get_company_info(ticker: str) -> dict:
    """
    Récupère les informations de base d'une entreprise.
    Retourne un dict vide si le ticker n'existe pas ou si Yahoo rate-limite.
    Cache 15 min pour éviter de spammer Yahoo Finance.
    """
    key = (ticker.upper(), "info")
    cached = _cache_get(key, _CACHE_TTL_INFO)
    if cached is not None:
        return cached
    try:
        stock = yf.Ticker(ticker.upper())
        info = stock.info
        if not info:
            logger.warning(f"Ticker {ticker} : aucune donnée yfinance")
            return {}
        has_identity = info.get("symbol") or info.get("shortName") or info.get("longName")
        if not has_identity:
            logger.warning(f"Ticker {ticker} introuvable sur Yahoo Finance")
            return {}
        _cache_set(key, info)
        return info
    except Exception as e:
        logger.error(f"Erreur récupération info {ticker}: {e}")
        return {}


def get_current_price(ticker: str) -> Optional[float]:
    """Prix actuel (ou dernier prix connu). None si indisponible."""
    info = get_company_info(ticker)
    return (
        info.get("currentPrice")
        or info.get("regularMarketPrice")
        or info.get("previousClose")
    )


def get_price_history(ticker: str, period: str = "1y") -> pd.DataFrame:
    """
    Historique OHLCV.
    period : "1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"
    Retourne DataFrame vide si échec. Cache 5 min par (ticker, period).
    """
    key = (ticker.upper(), f"hist_{period}")
    cached = _cache_get(key, _CACHE_TTL_PRICE)
    if cached is not None:
        return cached
    try:
        stock = yf.Ticker(ticker.upper())
        df = stock.history(period=period, auto_adjust=True)
        if not df.empty:
            _cache_set(key, df)
        return df
    except Exception as e:
        logger.error(f"Erreur historique {ticker}: {e}")
        return pd.DataFrame()


def get_fundamentals(ticker: str) -> dict:
    """
    Ratios financiers clés depuis yfinance.
    Chaque clé manquante → None (jamais d'exception propagée).

    Données fiables pour les large caps US et Europe.
    Pour les small caps, vérifier manuellement les valeurs aberrantes.
    """
    info = get_company_info(ticker)
    if not info:
        return {}

    # On extrait uniquement ce qui est utile en V1
    # Chaque ratio est nommé de façon explicite pour rester lisible
    return {
        # Valorisation
        "pe_ratio": info.get("trailingPE"),
        "forward_pe": info.get("forwardPE"),
        "peg_ratio": info.get("pegRatio"),
        "price_to_book": info.get("priceToBook"),
        "price_to_sales": info.get("priceToSalesTrailing12Months"),
        "ev_to_ebitda": info.get("enterpriseToEbitda"),
        "ev_to_revenue": info.get("enterpriseToRevenue"),

        # Rendement
        "dividend_yield": info.get("dividendYield"),
        "dividend_rate": info.get("dividendRate"),

        # Rentabilité
        "gross_margin": info.get("grossMargins"),
        "operating_margin": info.get("operatingMargins"),
        "net_margin": info.get("profitMargins"),
        "roe": info.get("returnOnEquity"),
        "roa": info.get("returnOnAssets"),

        # Croissance
        "revenue_growth": info.get("revenueGrowth"),
        "earnings_growth": info.get("earningsGrowth"),
        "earnings_quarterly_growth": info.get("earningsQuarterlyGrowth"),

        # Bilan
        "total_debt": info.get("totalDebt"),
        "cash": info.get("totalCash"),
        "debt_to_equity": info.get("debtToEquity"),
        "current_ratio": info.get("currentRatio"),
        "quick_ratio": info.get("quickRatio"),

        # Cash flow
        "free_cashflow": info.get("freeCashflow"),
        "operating_cashflow": info.get("operatingCashflow"),

        # Marché
        "market_cap": info.get("marketCap"),
        "enterprise_value": info.get("enterpriseValue"),
        "shares_outstanding": info.get("sharesOutstanding"),
        "float_shares": info.get("floatShares"),
        "shares_short": info.get("sharesShort"),

        # 52 semaines
        "week_52_high": info.get("fiftyTwoWeekHigh"),
        "week_52_low": info.get("fiftyTwoWeekLow"),
        "fifty_day_avg": info.get("fiftyDayAverage"),
        "two_hundred_day_avg": info.get("twoHundredDayAverage"),

        # Recommandation analystes
        "recommendation": info.get("recommendationKey"),
        "target_price": info.get("targetMeanPrice"),
        "analyst_count": info.get("numberOfAnalystOpinions"),
    }


def get_price_changes(ticker: str) -> dict:
    """
    Calcule les variations de prix sur plusieurs horizons.
    Toutes les données viennent de l'historique yfinance.
    """
    try:
        hist_1y = get_price_history(ticker, period="1y")
        if hist_1y.empty:
            return {}

        current = hist_1y["Close"].iloc[-1]
        changes = {"current_price": round(current, 2)}

        def safe_change(past_price: float) -> Optional[float]:
            if past_price and past_price > 0:
                return round((current - past_price) / past_price * 100, 2)
            return None

        # Variation 1 jour
        if len(hist_1y) >= 2:
            changes["change_1d"] = safe_change(hist_1y["Close"].iloc[-2])

        # Variation 5 jours
        if len(hist_1y) >= 6:
            changes["change_5d"] = safe_change(hist_1y["Close"].iloc[-6])

        # Variation 1 mois (~21 jours de bourse)
        if len(hist_1y) >= 22:
            changes["change_1m"] = safe_change(hist_1y["Close"].iloc[-22])

        # Variation 3 mois (~63 jours de bourse)
        if len(hist_1y) >= 64:
            changes["change_3m"] = safe_change(hist_1y["Close"].iloc[-64])

        # YTD
        hist_ytd = get_price_history(ticker, period="ytd")
        if not hist_ytd.empty:
            changes["change_ytd"] = safe_change(hist_ytd["Close"].iloc[0])

        # Distance depuis le 52W high/low
        high_52w = hist_1y["High"].max()
        low_52w = hist_1y["Low"].min()
        changes["pct_from_52w_high"] = round((current - high_52w) / high_52w * 100, 2)
        changes["pct_from_52w_low"] = round((current - low_52w) / low_52w * 100, 2)

        return changes
    except Exception as e:
        logger.error(f"Erreur calcul variations {ticker}: {e}")
        return {}


def get_news(ticker: str, count: int = 10) -> list[dict]:
    """
    News récentes depuis Yahoo Finance.
    Retourne une liste de dicts avec title, link, published, publisher.

    Structure yfinance ≥1.0 : chaque item = {"id": ..., "content": {...}}
    Structure yfinance 0.x  : chaque item = {"title": ..., "link": ..., ...}
    On supporte les deux.
    """
    try:
        stock = yf.Ticker(ticker.upper())
        news = stock.news or []
        result = []
        for item in news[:count]:
            # yfinance ≥1.0
            if "content" in item:
                c = item["content"]
                result.append({
                    "title": c.get("title", ""),
                    "link": (c.get("canonicalUrl") or {}).get("url", ""),
                    "publisher": (c.get("provider") or {}).get("displayName", ""),
                    "published": c.get("pubDate"),
                    "type": c.get("contentType", "STORY"),
                })
            else:
                # yfinance 0.x (fallback)
                result.append({
                    "title": item.get("title", ""),
                    "link": item.get("link", ""),
                    "publisher": item.get("publisher", ""),
                    "published": datetime.fromtimestamp(item.get("providerPublishTime", 0)).isoformat()
                                 if item.get("providerPublishTime") else None,
                    "type": item.get("type", "STORY"),
                })
        return result
    except Exception as e:
        logger.error(f"Erreur news {ticker}: {e}")
        return []


def get_earnings_calendar(ticker: str) -> dict:
    """Prochaine date de résultats si disponible."""
    try:
        stock = yf.Ticker(ticker.upper())
        cal = stock.calendar
        if cal is not None and not (isinstance(cal, dict) and not cal):
            if isinstance(cal, dict):
                return {
                    "earnings_date": str(cal.get("Earnings Date", [None])[0])
                                     if cal.get("Earnings Date") else None,
                    "revenue_estimate": cal.get("Revenue Estimate"),
                    "eps_estimate": cal.get("EPS Estimate"),
                }
        return {}
    except Exception as e:
        logger.error(f"Erreur calendrier {ticker}: {e}")
        return {}


def search_ticker(query: str) -> list[dict]:
    """
    Recherche de tickers par nom ou symbole.
    yfinance n'a pas de search native propre —
    on utilise yf.Ticker directement et on vérifie si les données existent.
    """
    results = []
    # Essai direct avec le query comme ticker
    ticker = query.upper().strip()
    info = get_company_info(ticker)
    if info:
        results.append({
            "ticker": ticker,
            "name": info.get("longName") or info.get("shortName", ticker),
            "exchange": info.get("exchange"),
            "sector": info.get("sector"),
        })
    return results
