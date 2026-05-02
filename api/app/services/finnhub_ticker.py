"""
Finnhub Ticker Data — données par société.

Endpoints utilisés :
  - /stock/insider-transactions  → achats/ventes des dirigeants
  - /stock/recommendation         → distribution buy/hold/sell par mois
  - /stock/price-target           → consensus price target
  - /stock/profile2               → infos société + logo officiel
  - /company-news                 → news officielles par ticker

Caches longs différenciés selon la fraîcheur réelle des données :
  - insider trading : 6h
  - recommendations : 24h
  - price target    : 24h
  - profile         : 7 jours
  - company news    : 30 min
"""
import logging
import os
import threading
from datetime import date, datetime, timedelta
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

FINNHUB_BASE_URL = "https://finnhub.io/api/v1"

# TTL différenciés
TTL_INSIDER     = 6 * 3600          # 6h
TTL_RECOS       = 24 * 3600         # 24h
TTL_TARGET      = 24 * 3600         # 24h
TTL_PROFILE     = 7 * 24 * 3600     # 7 jours
TTL_NEWS        = 30 * 60           # 30 min

# Cache générique : { (kind, ticker) : { "data": ..., "ts": datetime } }
_cache: dict = {}
_lock = threading.Lock()


def _get_api_key() -> Optional[str]:
    return os.getenv("FINNHUB_API_KEY")


def _cache_get(kind: str, ticker: str, ttl: int):
    with _lock:
        entry = _cache.get((kind, ticker.upper()))
        if entry is None:
            return None
        age = (datetime.utcnow() - entry["ts"]).total_seconds()
        if age > ttl:
            return None
        return entry["data"]


def _cache_set(kind: str, ticker: str, data):
    with _lock:
        _cache[(kind, ticker.upper())] = {"data": data, "ts": datetime.utcnow()}


def _fetch(endpoint: str, params: dict) -> Optional[dict]:
    key = _get_api_key()
    if not key:
        return None
    params = {**params, "token": key}
    try:
        resp = httpx.get(f"{FINNHUB_BASE_URL}{endpoint}", params=params, timeout=15)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.warning(f"Finnhub fetch {endpoint} error: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────
# Insider Trading
# ─────────────────────────────────────────────────────────────────────

def get_insider_transactions(ticker: str) -> list[dict]:
    """
    Retourne les transactions insiders des 3 derniers mois (limit Finnhub).
    Format normalisé :
      {name, share, change, transactionDate, transactionPrice, transactionCode}
    transactionCode : P=purchase, S=sale, A=award, D=disposal
    """
    cached = _cache_get("insider", ticker, TTL_INSIDER)
    if cached is not None:
        return cached

    today = date.today()
    from_d = (today - timedelta(days=90)).isoformat()
    to_d = today.isoformat()
    raw = _fetch("/stock/insider-transactions", {"symbol": ticker.upper(), "from": from_d, "to": to_d})
    transactions = (raw or {}).get("data", []) or []

    # Tri par date desc
    transactions.sort(key=lambda x: x.get("transactionDate") or "", reverse=True)
    _cache_set("insider", ticker, transactions)
    return transactions


def insider_summary(transactions: list[dict]) -> dict:
    """Résumé des transactions : net, achats, ventes."""
    if not transactions:
        return {"count": 0, "net_shares": 0, "total_buy": 0, "total_sell": 0, "net_value_usd": 0}
    buy_shares = 0
    sell_shares = 0
    net_value = 0.0
    for t in transactions:
        change = t.get("change") or 0
        price = t.get("transactionPrice") or 0
        if change > 0:
            buy_shares += change
        else:
            sell_shares += abs(change)
        net_value += change * price
    return {
        "count": len(transactions),
        "net_shares": buy_shares - sell_shares,
        "total_buy": buy_shares,
        "total_sell": sell_shares,
        "net_value_usd": round(net_value, 0),
    }


# ─────────────────────────────────────────────────────────────────────
# Recommandations analystes
# ─────────────────────────────────────────────────────────────────────

def get_recommendations(ticker: str) -> list[dict]:
    """
    Retourne distribution analystes par mois (les ~12 derniers mois).
    Format : [{period, strongBuy, buy, hold, sell, strongSell}, ...]
    """
    cached = _cache_get("recos", ticker, TTL_RECOS)
    if cached is not None:
        return cached
    raw = _fetch("/stock/recommendation", {"symbol": ticker.upper()})
    if not isinstance(raw, list):
        raw = []
    raw.sort(key=lambda x: x.get("period") or "", reverse=True)  # plus récent en premier
    _cache_set("recos", ticker, raw)
    return raw


def get_price_target(ticker: str) -> Optional[dict]:
    """
    Retourne consensus price target.
    Format : {targetHigh, targetLow, targetMean, targetMedian, lastUpdated, numberOfAnalysts}
    """
    cached = _cache_get("target", ticker, TTL_TARGET)
    if cached is not None:
        return cached
    data = _fetch("/stock/price-target", {"symbol": ticker.upper()})
    _cache_set("target", ticker, data)
    return data


# ─────────────────────────────────────────────────────────────────────
# Profile (logos + infos)
# ─────────────────────────────────────────────────────────────────────

def get_profile(ticker: str) -> Optional[dict]:
    """
    Retourne le profil société (logo, nom, secteur, marketCap, exchange, country, weburl).
    """
    cached = _cache_get("profile", ticker, TTL_PROFILE)
    if cached is not None:
        return cached
    data = _fetch("/stock/profile2", {"symbol": ticker.upper()})
    _cache_set("profile", ticker, data)
    return data


# ─────────────────────────────────────────────────────────────────────
# Company news
# ─────────────────────────────────────────────────────────────────────

def get_company_news(ticker: str, days_back: int = 7) -> list[dict]:
    """
    Retourne news officielles depuis Finnhub (mieux structuré que Google News).
    Format : [{datetime, headline, summary, source, url, image, related, category}, ...]
    """
    cached = _cache_get("news", ticker, TTL_NEWS)
    if cached is not None:
        return cached
    today = date.today()
    from_d = (today - timedelta(days=days_back)).isoformat()
    to_d = today.isoformat()
    raw = _fetch("/company-news", {"symbol": ticker.upper(), "from": from_d, "to": to_d})
    if not isinstance(raw, list):
        raw = []
    raw.sort(key=lambda x: x.get("datetime", 0), reverse=True)
    _cache_set("news", ticker, raw)
    return raw


def is_configured() -> bool:
    return bool(_get_api_key())
