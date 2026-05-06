"""
ETF Holdings — découverte dynamique de candidats via composition d'ETF thématiques.

Idée : les gestionnaires d'ETF AI/robotics/uranium font le travail de curation
thématique en continu. On hérite gratuitement de leur sélection.

Sources combinées :
  1. stockanalysis.com (full holdings, ~50-300 lignes) — source primaire scrappée
  2. yfinance.Ticker(etf).funds_data.top_holdings (top ~10) — fallback / complément

Important pour la thèse small/mid caps : yfinance seul rate les positions
au-delà du top 10 (Vertiv, Iris Energy, etc.) qui sont précisément ce qu'on
cherche. La source stockanalysis donne la liste complète.

Cache 24h par ETF pour éviter le scraping inutile.
"""
import logging
import re
import threading
from datetime import datetime, timedelta
from typing import Optional

import httpx

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


def _fetch_full_holdings_stockanalysis(etf_ticker: str) -> list[dict]:
    """
    Scrape stockanalysis.com/etf/{ticker}/holdings/ pour obtenir la liste
    complète des holdings (typiquement 25-300 lignes, vs ~10 chez yfinance).

    Le DOM est rendu Svelte avec beaucoup de commentaires HTML. On utilise
    BeautifulSoup (déjà dans les deps via web_research) pour parser le tableau
    de holdings de façon robuste.

    Retourne [] en cas d'échec — le caller fera le fallback yfinance.
    """
    url = f"https://stockanalysis.com/etf/{etf_ticker.lower()}/holdings/"
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        logger.debug("bs4 indisponible — pas de scrape full holdings")
        return []

    try:
        r = httpx.get(
            url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; AusterlitzBot/1.0)"},
            timeout=10.0,
            follow_redirects=True,
        )
        if r.status_code != 200:
            return []
        soup = BeautifulSoup(r.text, "html.parser")
        table = soup.find("table")
        if table is None:
            return []

        out: list[dict] = []
        seen: set[str] = set()
        for row in table.find_all("tr"):
            cells = [c.get_text(strip=True) for c in row.find_all("td")]
            # Lignes valides : rank, symbol, name, weight%, (shares)
            if len(cells) < 4:
                continue
            try:
                int(cells[0])
            except ValueError:
                continue  # ligne d'entête ou non-data
            symbol = cells[1].strip().upper()
            # Skip listings non-US (format "KRX: 000660", "TYO: 6920", etc.) car
            # non couverts par les 13-F SEC. yfinance ne les a pas non plus.
            if ":" in symbol:
                continue
            if not symbol or symbol in seen:
                continue
            name = cells[2]
            weight_str = cells[3].rstrip("%").strip()
            try:
                weight = float(weight_str) / 100.0
            except ValueError:
                weight = 0.0
            seen.add(symbol)
            out.append({"symbol": symbol, "name": name, "weight": weight})
        return out
    except Exception as e:
        logger.debug(f"stockanalysis holdings '{etf_ticker}' failed: {e}")
        return []


def _fetch_top_holdings_yfinance(etf_ticker: str) -> list[dict]:
    """Fallback yfinance — top 10 typiquement. Utilisé si stockanalysis échoue."""
    holdings: list[dict] = []
    try:
        import yfinance as yf
        fd = yf.Ticker(etf_ticker).funds_data
        df = fd.top_holdings
        if df is not None and not df.empty:
            for sym, row in df.iterrows():
                holdings.append({
                    "symbol": str(sym).upper(),
                    "name": row.get("Name") or sym,
                    "weight": float(row.get("Holding Percent") or 0.0),
                })
    except Exception as e:
        logger.debug(f"yfinance holdings lookup '{etf_ticker}' failed: {e}")
    return holdings


def get_etf_holdings(etf_ticker: str) -> list[dict]:
    """
    Retourne les holdings d'un ETF. Source : stockanalysis.com (complet),
    avec fallback yfinance (top 10) si le scraping échoue. Cache 24h.

    Format : [{"symbol": "NVDA", "name": "Nvidia", "weight": 0.082}, ...]
    """
    etf_ticker = etf_ticker.upper()
    with _lock:
        cached = _cache.get(etf_ticker)
        if cached and (datetime.utcnow() - cached[1]) < _TTL:
            return cached[0]

    holdings = _fetch_full_holdings_stockanalysis(etf_ticker)
    if len(holdings) < 5:
        # Suspect (ETF qui ne devrait jamais avoir < 5 holdings) → fallback
        yf_holdings = _fetch_top_holdings_yfinance(etf_ticker)
        if len(yf_holdings) > len(holdings):
            holdings = yf_holdings

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
