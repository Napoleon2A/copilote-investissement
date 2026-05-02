"""
Finnhub Earnings Calendar — calendrier complet des publications.

Free tier : 60 calls/min, suffisant largement pour notre usage (1 fetch / 30 min).

Endpoint utilisé :
  https://finnhub.io/api/v1/calendar/earnings?from=YYYY-MM-DD&to=YYYY-MM-DD&token=KEY

Cache mémoire 1h pour limiter les appels.
"""
import logging
import os
import threading
from datetime import date, datetime, timedelta
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

FINNHUB_BASE_URL = "https://finnhub.io/api/v1"
CACHE_TTL_SECONDS = 3600  # 1h

_cache: dict = {
    "earnings": None,        # list[dict] | None
    "computed_at": None,     # datetime | None
    "from_date": None,       # str | None
    "to_date": None,         # str | None
    "is_running": False,
    "last_error": None,
}
_lock = threading.Lock()


def _get_api_key() -> Optional[str]:
    return os.getenv("FINNHUB_API_KEY")


def fetch_earnings_calendar(from_date: str, to_date: str) -> list[dict]:
    """
    Fetch direct depuis Finnhub. Retourne une liste de dicts :
    [{symbol, date, hour, year, quarter, epsActual, epsEstimate, revenueActual, revenueEstimate}, ...]
    """
    key = _get_api_key()
    if not key:
        logger.warning("FINNHUB_API_KEY non définie — skip")
        return []

    url = f"{FINNHUB_BASE_URL}/calendar/earnings"
    params = {"from": from_date, "to": to_date, "token": key}
    try:
        resp = httpx.get(url, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        return data.get("earningsCalendar", []) or []
    except Exception as e:
        logger.warning(f"Finnhub calendar error: {e}")
        return []


def get_cached_calendar(max_days: int = 15) -> list[dict]:
    """
    Retourne le calendrier en cache si frais, sinon refresh en background et
    retourne ce qu'on a (potentiellement vide au premier appel).
    """
    with _lock:
        cached = _cache["earnings"]
        computed_at = _cache["computed_at"]
        is_fresh = (
            cached is not None
            and computed_at is not None
            and (datetime.utcnow() - computed_at).total_seconds() < CACHE_TTL_SECONDS
        )
        is_running = _cache["is_running"]

    if not is_fresh and not is_running:
        trigger_background_refresh(max_days=max_days)

    today = date.today()
    cutoff = today + timedelta(days=max_days)

    # Filtrer les publications du cache dans la fenêtre demandée
    if cached is None:
        return []

    filtered = []
    for e in cached:
        date_str = e.get("date")
        if not date_str:
            continue
        try:
            ed = date.fromisoformat(date_str)
        except Exception:
            continue
        if ed < today or ed > cutoff:
            continue
        filtered.append(e)
    return filtered


def trigger_background_refresh(max_days: int = 15) -> bool:
    """Lance un refresh en background. Retourne False si déjà en cours."""
    with _lock:
        if _cache["is_running"]:
            return False
        _cache["is_running"] = True

    def _run():
        try:
            today = date.today()
            from_d = today.isoformat()
            # On fetch un peu large (30j) pour absorber des fenêtres variables sans refetch
            to_d = (today + timedelta(days=30)).isoformat()
            logger.info(f"Finnhub calendar: refresh {from_d} → {to_d}")
            data = fetch_earnings_calendar(from_d, to_d)
            with _lock:
                _cache["earnings"] = data
                _cache["computed_at"] = datetime.utcnow()
                _cache["from_date"] = from_d
                _cache["to_date"] = to_d
                _cache["last_error"] = None
            logger.info(f"Finnhub calendar: {len(data)} publications cachées")
        except Exception as e:
            logger.error(f"Finnhub calendar refresh error: {e}")
            with _lock:
                _cache["last_error"] = str(e)
        finally:
            with _lock:
                _cache["is_running"] = False

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return True


def is_configured() -> bool:
    return bool(_get_api_key())
