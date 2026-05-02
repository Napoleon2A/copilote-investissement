"""
Finnhub Economic Calendar — events macro à venir (Fed, CPI, NFP, GDP, RBA, ECB, etc.).

Endpoint :
  https://finnhub.io/api/v1/calendar/economic?from=YYYY-MM-DD&to=YYYY-MM-DD&token=KEY

Cache mémoire 4h (les events changent peu en intra-day).
"""
import logging
import os
import threading
from datetime import date, datetime, timedelta
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

FINNHUB_BASE_URL = "https://finnhub.io/api/v1"
CACHE_TTL_SECONDS = 4 * 3600  # 4h

_cache: dict = {
    "events": None,
    "computed_at": None,
    "is_running": False,
    "last_error": None,
}
_lock = threading.Lock()


def _get_api_key() -> Optional[str]:
    return os.getenv("FINNHUB_API_KEY")


def fetch_economic_calendar(from_date: str, to_date: str) -> list[dict]:
    key = _get_api_key()
    if not key:
        return []
    url = f"{FINNHUB_BASE_URL}/calendar/economic"
    params = {"from": from_date, "to": to_date, "token": key}
    try:
        resp = httpx.get(url, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        return data.get("economicCalendar", []) or []
    except Exception as e:
        logger.warning(f"Finnhub economic calendar error: {e}")
        return []


def get_cached_events(max_days: int = 15, only_high: bool = False, countries: Optional[list[str]] = None) -> list[dict]:
    """Retourne les events filtrés depuis le cache."""
    with _lock:
        cached = _cache["events"]
        computed_at = _cache["computed_at"]
        is_fresh = (
            cached is not None
            and computed_at is not None
            and (datetime.utcnow() - computed_at).total_seconds() < CACHE_TTL_SECONDS
        )
        is_running = _cache["is_running"]

    if not is_fresh and not is_running:
        trigger_background_refresh()

    if cached is None:
        return []

    today = date.today()
    cutoff = today + timedelta(days=max_days)
    out = []
    for e in cached:
        time_str = e.get("time")
        if not time_str:
            continue
        try:
            ed = datetime.fromisoformat(time_str.replace("Z", "+00:00")).date() if "T" in time_str or " " in time_str else date.fromisoformat(time_str[:10])
        except Exception:
            continue
        if ed < today or ed > cutoff:
            continue
        if only_high and (e.get("impact") or "").lower() != "high":
            continue
        if countries and (e.get("country") or "") not in countries:
            continue
        out.append(e)
    # Tri chronologique
    out.sort(key=lambda x: x.get("time") or "")
    return out


def trigger_background_refresh() -> bool:
    with _lock:
        if _cache["is_running"]:
            return False
        _cache["is_running"] = True

    def _run():
        try:
            today = date.today()
            from_d = today.isoformat()
            to_d = (today + timedelta(days=30)).isoformat()
            logger.info(f"Finnhub economic: refresh {from_d} → {to_d}")
            data = fetch_economic_calendar(from_d, to_d)
            with _lock:
                _cache["events"] = data
                _cache["computed_at"] = datetime.utcnow()
                _cache["last_error"] = None
            logger.info(f"Finnhub economic: {len(data)} events cachés")
        except Exception as e:
            logger.error(f"Finnhub economic refresh error: {e}")
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
