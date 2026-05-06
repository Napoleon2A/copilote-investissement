"""
ETF Holdings — découverte dynamique de candidats via composition d'ETF thématiques.

Idée : les gestionnaires d'ETF AI/robotics/uranium font le travail de curation
thématique en continu. On hérite gratuitement de leur sélection.

Sources par priorité (fallback en cascade) :
  1. CSV officiel issuer (GlobalX expose la liste COMPLÈTE quotidiennement
     en CSV public, ex: AIQ ~95 holdings, BOTZ ~45, URA ~50). Couvre AIQ,
     BOTZ, URA. URL pattern : assets.globalxetfs.com/funds/holdings/{etf}_full-holdings_{YYYYMMDD}.csv
  2. stockanalysis.com (top ~25, paginé côté JS donc inaccessible plus loin)
  3. yfinance top_holdings (~10 max) — dernier filet

Pourquoi cette cascade : yfinance et stockanalysis ratent VRT, IREN, CRWV et
autres small/mid caps de la chaîne IA qui sont précisément la cible. Le CSV
GlobalX donne la liste complète et résout ce trou pour les 3 ETF GlobalX.

Cache 24h par ETF.
"""
import csv as csvmod
import io
import logging
import re
import threading
from datetime import datetime, timedelta
from typing import Optional

import httpx

# ETF dont l'émetteur expose un CSV complet officiel (GlobalX). On préfère
# toujours cette source quand elle existe : c'est la référence légale.
GLOBALX_ETFS = {"AIQ", "BOTZ", "URA"}

logger = logging.getLogger(__name__)

# ETF thématiques cibles — couvrent la chaîne de valeur IA.
# Plusieurs ETF par sous-thème pour combler les angles morts : un ticker présent
# dans 1 seul ETF "lointain" (ex: NUKZ) peut être raté si on n'a que NLR.
THEMED_ETFS: dict[str, str] = {
    # AI mainstream
    "AIQ":  "Global X AI & Technology",
    "CHAT": "Roundhill Generative AI & Tech",
    "ARKQ": "ARK Autonomous Tech & Robotics",
    # Robotics & automation
    "BOTZ": "Global X Robotics & AI",
    "ROBO": "Robo Global Robotics & Automation",
    # Semiconductors (3 angles : iShares vs VanEck vs quantum)
    "SOXX": "iShares Semiconductor",
    "SMH":  "VanEck Semiconductor",
    "QTUM": "Defiance Quantum",
    # Software
    "IGV":  "iShares Software",
    # Uranium / nuclear (4 angles)
    "URNM": "Sprott Uranium Miners",
    "URA":  "Global X Uranium",
    "NLR":  "Sprott Nuclear Energy",
    "NUKZ": "Range Nuclear Renaissance",
    # Power / grid pour l'AI energy
    "GRID": "First Trust Smart Grid Infrastructure",
    "PAVE": "Global X US Infrastructure Development",
    # Clean energy (transition)
    "ICLN": "iShares Global Clean Energy",
    # Data centers, cloud, digital infra (capture VRT/IREN/APLD/DELL/SMCI
    # qui ne sont pas dans les ETF AI core)
    "DTCR": "Pacer Data Center REITs",
    "VPN":  "Global X Data Center & Digital Infra REIT",
    "DAPP": "VanEck Digital Transformation",
    "SKYY": "First Trust Cloud Computing",
}

_TTL = timedelta(hours=24)
_cache: dict[str, tuple[list[dict], datetime]] = {}
_lock = threading.Lock()


def _fetch_globalx_csv(etf_ticker: str) -> list[dict]:
    """
    Récupère le CSV officiel des holdings depuis GlobalX (AIQ/BOTZ/URA).

    Étape 1 : scrape la page funds/{etf}/ pour extraire l'URL CSV daté.
    Étape 2 : télécharge et parse le CSV.

    Le CSV a la forme :
      Header info (2 lignes)
      "% of Net Assets,Ticker,Name,SEDOL,Market Price ($),Shares Held,Market Value ($)"
      data rows...

    Skip les listings non-US (ticker contient un espace ou un suffixe " KS",
    " HK" etc. comme "000660 KS" pour SK Hynix).
    """
    page_url = f"https://www.globalxetfs.com/funds/{etf_ticker.lower()}/"
    try:
        page = httpx.get(
            page_url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; AusterlitzBot/1.0)"},
            timeout=10.0,
            follow_redirects=True,
        )
        if page.status_code != 200:
            return []
        # Extrait le lien CSV daté (pattern : aiq_full-holdings_YYYYMMDD.csv)
        m = re.search(
            r'https://assets\.globalxetfs\.com/funds/holdings/[a-z]+_full-holdings_\d{8}\.csv',
            page.text,
        )
        if not m:
            return []
        csv_url = m.group(0)

        csv_resp = httpx.get(
            csv_url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; AusterlitzBot/1.0)"},
            timeout=15.0,
        )
        if csv_resp.status_code != 200:
            return []

        out: list[dict] = []
        seen: set[str] = set()
        reader = csvmod.reader(io.StringIO(csv_resp.text))
        in_data = False
        for row in reader:
            if not row:
                continue
            # Skip jusqu'à trouver la ligne d'entête
            if not in_data:
                if row[0].startswith("%") or "of Net Assets" in row[0]:
                    in_data = True
                continue
            # Lignes data : % | Ticker | Name | SEDOL | ...
            if len(row) < 3:
                continue
            try:
                weight_pct = float(row[0])
            except ValueError:
                continue
            ticker = row[1].strip().upper()
            # Skip listings non-US (espace dans le ticker = code marché étranger
            # type "000660 KS"). Les 13-F SEC ne couvrent pas ces titres.
            if " " in ticker or not ticker:
                continue
            if ticker in seen:
                continue
            seen.add(ticker)
            name = row[2].strip()
            out.append({
                "symbol": ticker,
                "name": name,
                "weight": weight_pct / 100.0,
            })
        return out
    except Exception as e:
        logger.debug(f"globalx CSV '{etf_ticker}' failed: {e}")
        return []


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
    Retourne les holdings d'un ETF. Cascade de sources, on garde la plus
    complète disponible. Cache 24h.

    Format : [{"symbol": "NVDA", "name": "Nvidia", "weight": 0.082}, ...]
    """
    etf_ticker = etf_ticker.upper()
    with _lock:
        cached = _cache.get(etf_ticker)
        if cached and (datetime.utcnow() - cached[1]) < _TTL:
            return cached[0]

    holdings: list[dict] = []
    # Source #1 : CSV officiel GlobalX (full holdings) si applicable
    if etf_ticker in GLOBALX_ETFS:
        holdings = _fetch_globalx_csv(etf_ticker)

    # Source #2 : stockanalysis (top ~25) si #1 vide ou non-applicable
    if len(holdings) < 5:
        sa = _fetch_full_holdings_stockanalysis(etf_ticker)
        if len(sa) > len(holdings):
            holdings = sa

    # Source #3 : yfinance (top ~10) — dernier filet
    if len(holdings) < 5:
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
