"""
Persistance disque légère pour les caches en mémoire process (sec_edgar,
etf_holdings, finnhub_ticker). Évite le 30-90s "cache cold" à chaque restart
uvicorn.

Format : pickle dans api/data/cache/{name}.pkl. Atomic write via .tmp + replace.
Pas de schéma DB — évite d'élargir le modèle SQLModel pour des données
ephémères. Les TTL sont gérés par le module appelant (les caches embarquent
déjà leur timestamp dans `entry["ts"]`).
"""
import logging
import pickle
import threading
from pathlib import Path

logger = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

_save_lock = threading.Lock()


def load(name: str) -> dict:
    """Recharge un cache depuis le disque ou retourne {} si absent/corrompu."""
    p = CACHE_DIR / f"{name}.pkl"
    if not p.exists():
        return {}
    try:
        with p.open("rb") as f:
            data = pickle.load(f)
        if isinstance(data, dict):
            logger.info(f"disk_cache [{name}]: rechargé {len(data)} entrées")
            return data
        return {}
    except Exception as e:
        logger.warning(f"disk_cache load {name}: {e} — repart à vide")
        return {}


def save(name: str, cache: dict) -> None:
    """Persiste un cache de façon atomique (tmp + replace)."""
    with _save_lock:
        p = CACHE_DIR / f"{name}.pkl"
        tmp = p.with_suffix(".pkl.tmp")
        try:
            with tmp.open("wb") as f:
                pickle.dump(cache, f, protocol=pickle.HIGHEST_PROTOCOL)
            tmp.replace(p)
        except Exception as e:
            logger.warning(f"disk_cache save {name}: {e}")


def start_periodic_flush(name: str, get_cache, interval_seconds: int = 60) -> None:
    """
    Démarre un thread daemon qui flush `get_cache()` sur disque toutes les N
    secondes. Idempotent — chaque appel démarre un nouveau thread, donc
    appeler une seule fois au boot.
    """
    def _loop():
        import time
        while True:
            time.sleep(interval_seconds)
            try:
                save(name, get_cache())
            except Exception as e:
                logger.warning(f"disk_cache flush {name}: {e}")

    t = threading.Thread(target=_loop, daemon=True, name=f"disk-flush-{name}")
    t.start()
