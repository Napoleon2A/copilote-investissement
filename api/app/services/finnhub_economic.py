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


def get_cached_events(
    max_days: int = 15,
    lookback_days: int = 7,
    only_high: bool = False,
    countries: Optional[list[str]] = None,
) -> list[dict]:
    """
    Retourne les events filtrés (passés + à venir) depuis le cache.
    `lookback_days` : nb de jours d'events passés à inclure (avec actual/forecast/prev).
    `max_days` : nb de jours d'events à venir (avec estimate uniquement).
    Chaque event est annoté avec is_past=True/False pour le frontend.
    """
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
    floor = today - timedelta(days=lookback_days)
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
        if ed < floor or ed > cutoff:
            continue
        if only_high and (e.get("impact") or "").lower() != "high":
            continue
        if countries and (e.get("country") or "") not in countries:
            continue
        # Annoter is_past pour le frontend (= event passé, peut afficher actual)
        e["is_past"] = ed < today
        out.append(e)
    # Tri chronologique (récent → futur)
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
            # On fetch -10 jours pour avoir les events récents avec actual disponibles
            from_d = (today - timedelta(days=10)).isoformat()
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


# ── Interprétation des events passés ─────────────────────────────────────
# Pour les events où on a `actual` + `estimate` (consensus) + `prev` (valeur précédente),
# on génère une phrase courte qui résume le surprise et l'évolution.

def _safe_float(v) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def interpret_economic_event(event: dict) -> Optional[str]:
    """
    Retourne une phrase courte pour les events PASSÉS avec actual disponible.
    Compare actual à estimate (consensus) et à prev (valeur N-1).
    Retourne None si données insuffisantes ou event futur.
    """
    if not event.get("is_past"):
        return None
    actual = _safe_float(event.get("actual"))
    estimate = _safe_float(event.get("estimate"))
    prev = _safe_float(event.get("prev"))
    if actual is None:
        return None  # Event passé mais valeur pas encore publiée

    parts: list[str] = []

    # Surprise vs consensus
    if estimate is not None and estimate != 0:
        diff_pct = (actual - estimate) / abs(estimate) * 100
        if abs(diff_pct) < 2:
            parts.append("conforme au consensus")
        elif actual > estimate:
            parts.append(f"plus chaud que prévu ({_fmt(actual)} vs {_fmt(estimate)} attendu)")
        else:
            parts.append(f"moins fort que prévu ({_fmt(actual)} vs {_fmt(estimate)} attendu)")
    elif estimate is not None:
        # estimate = 0, on évite la division
        parts.append(f"actual {_fmt(actual)} vs {_fmt(estimate)} attendu")

    # Évolution vs N-1
    if prev is not None and prev != 0:
        diff_prev_pct = (actual - prev) / abs(prev) * 100
        if abs(diff_prev_pct) >= 2:
            direction = "en hausse" if actual > prev else "en baisse"
            parts.append(f"{direction} vs précédent ({_fmt(prev)})")
        else:
            parts.append(f"stable vs précédent ({_fmt(prev)})")

    if not parts:
        return None
    msg = " · ".join(parts)
    return msg[0].upper() + msg[1:] if msg else msg


def _fmt(v: float) -> str:
    """Formate une valeur économique courte (ex: 53.2, 2.4%, 250K)."""
    av = abs(v)
    if av >= 1000:
        return f"{v / 1000:.1f}K" if av < 1_000_000 else f"{v / 1_000_000:.1f}M"
    if av >= 100:
        return f"{v:.0f}"
    if av < 10:
        return f"{v:.2f}"
    return f"{v:.1f}"
