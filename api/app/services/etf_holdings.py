"""
ETF Holdings — découverte dynamique de candidats via composition d'ETF thématiques.

Idée : les gestionnaires d'ETF AI/robotics/uranium font le travail de curation
thématique en continu. On hérite gratuitement de leur sélection en lisant les
top holdings via yfinance.Ticker(etf).funds_data.top_holdings.

Limite : yfinance ne retourne que le top 10 (parfois top 25) selon l'ETF, pas
toute la composition. Pour avoir 100% des holdings il faudrait les filings
N-PORT SEC ou les CSV des émetteurs (BlackRock, Global X, Roundhill...).
Top 10 par ETF reste suffisant pour générer des candidats : 8 ETF × 10 = 80
tickers thématiques rafraîchis automatiquement.

Cache 24h par ETF pour éviter de spammer Yahoo.
"""
import logging
import threading
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# ETF thématiques cibles — couvrent la chaîne de valeur IA
THEMED_ETFS: dict[str, str] = {
    "AIQ":  "iShares AI & Tech",
    "BOTZ": "Global X Robotics & AI",
    "CHAT": "Roundhill Generative AI & Tech",
    "ROBO": "Robo Global Robotics & Automation",
    "SOXX": "iShares Semiconductor",
    "IGV":  "iShares Software",
    "URNM": "Sprott Uranium Miners",
    "URA":  "Global X Uranium",
    "NLR":  "Sprott Nuclear Energy",
    "ICLN": "iShares Global Clean Energy",
}

_TTL = timedelta(hours=24)
_cache: dict[str, tuple[list[dict], datetime]] = {}
_lock = threading.Lock()


def get_etf_holdings(etf_ticker: str) -> list[dict]:
    """
    Retourne les top holdings d'un ETF. Cache 24h.

    Format : [{"symbol": "NVDA", "name": "Nvidia", "weight": 0.082}, ...]
    Liste vide si l'ETF n'expose pas ses holdings via yfinance.
    """
    etf_ticker = etf_ticker.upper()
    with _lock:
        cached = _cache.get(etf_ticker)
        if cached and (datetime.utcnow() - cached[1]) < _TTL:
            return cached[0]

    holdings: list[dict] = []
    try:
        import yfinance as yf
        fd = yf.Ticker(etf_ticker).funds_data
        df = fd.top_holdings
        if df is not None and not df.empty:
            for sym, row in df.iterrows():
                holdings.append({
                    "symbol": sym,
                    "name": row.get("Name") or sym,
                    "weight": float(row.get("Holding Percent") or 0.0),
                })
    except Exception as e:
        logger.debug(f"ETF holdings lookup '{etf_ticker}' failed: {e}")

    with _lock:
        _cache[etf_ticker] = (holdings, datetime.utcnow())
    return holdings


def get_themed_universe(etfs: Optional[list[str]] = None) -> dict[str, list[dict]]:
    """
    Retourne les holdings agrégés des ETF thématiques.

    Format : {etf_ticker: [{symbol, name, weight}, ...], ...}
    """
    target = etfs or list(THEMED_ETFS.keys())
    return {etf: get_etf_holdings(etf) for etf in target}


def get_unique_candidates(etfs: Optional[list[str]] = None) -> list[dict]:
    """
    Agrège tous les holdings uniques des ETF cibles avec compteur de présence.

    Si un ticker apparaît dans plusieurs ETF (ex: NVDA dans AIQ + SOXX + CHAT),
    c'est un signal fort de pertinence thématique. On retourne la liste triée
    par nombre d'ETF où le ticker apparaît (descendant) puis par poids moyen.

    Format : [{"symbol": "NVDA", "name": "...", "etf_count": 3, "etfs": ["AIQ","SOXX","CHAT"], "avg_weight": 0.05}, ...]
    """
    target = etfs or list(THEMED_ETFS.keys())
    aggregated: dict[str, dict] = {}
    for etf in target:
        for h in get_etf_holdings(etf):
            sym = h["symbol"]
            if sym not in aggregated:
                aggregated[sym] = {
                    "symbol": sym,
                    "name": h["name"],
                    "etfs": [],
                    "weights": [],
                }
            aggregated[sym]["etfs"].append(etf)
            aggregated[sym]["weights"].append(h["weight"])

    candidates = []
    for sym, data in aggregated.items():
        candidates.append({
            "symbol": sym,
            "name": data["name"],
            "etf_count": len(data["etfs"]),
            "etfs": data["etfs"],
            "avg_weight": sum(data["weights"]) / len(data["weights"]) if data["weights"] else 0.0,
        })
    candidates.sort(key=lambda c: (-c["etf_count"], -c["avg_weight"]))
    return candidates
