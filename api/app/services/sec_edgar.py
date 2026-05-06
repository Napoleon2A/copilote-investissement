"""
SEC EDGAR — Whale watching via 13-F filings.

13-F = déclaration trimestrielle des gestionnaires US gérant > 100M$.
Liste TOUTES leurs positions actions US en fin de trimestre (45 jours de retard).

100% gratuit, pas de clé API. SEC exige juste un User-Agent identifiant.

Workflow :
1. Pour chaque fonds suivi : submissions API → dernier 13F-HR
2. Fetch infotable.xml → parser positions (nameOfIssuer + value + shares)
3. Cache 7 jours (les filings sont trimestriels, ça change peu)
4. Lookup ticker → SEC company name via company_tickers.json
5. Match company name dans les positions des fonds → "qui détient ce ticker"

Limitations connues :
- 13-F est en retard de 45 jours (ex: fin Q3 = filing 14 nov)
- 13-F couvre seulement les positions LONG actions US (pas options, pas shorts, pas bonds)
- Petits caps peu suivis sont parfois absents
"""
import logging
import os
import re
import threading
from datetime import datetime
from typing import Optional
from xml.etree import ElementTree as ET

import httpx

logger = logging.getLogger(__name__)

# User-Agent obligatoire — SEC bloque sans
USER_AGENT = os.getenv("SEC_USER_AGENT", "AusterlitzApp/1.0 jean.natali@laposte.net")

TTL_FILINGS  = 7 * 24 * 3600   # 7 jours pour les 13-F (trimestriels)
TTL_TICKERS  = 30 * 24 * 3600  # 30 jours pour le mapping ticker → name

# Liste des super-investisseurs suivis (CIK → nom).
# Sélection : 25 fonds majeurs validés contre l'API SEC submissions (13F-HR récent < 1 an).
# Catégorisés pour donner du signal mixte : value, growth/tiger cubs, macro, quants.
WHALES: list[tuple[str, str]] = [
    # === Value Investors ===
    ("0001067983", "Berkshire Hathaway (Buffett)"),
    ("0001336528", "Pershing Square (Ackman)"),
    ("0001061768", "Baupost Group (Klarman)"),
    ("0001040273", "Third Point (Loeb)"),
    ("0001656456", "Appaloosa (Tepper)"),
    ("0001112520", "Akre Capital Management"),
    ("0001345471", "Trian Fund (Peltz)"),
    ("0001418814", "ValueAct Capital"),
    # === Tiger Cubs / Long-Short Equity ===
    ("0001061165", "Lone Pine Capital (Mandel)"),
    ("0001167483", "Tiger Global (Coleman)"),
    ("0001135730", "Coatue Management (Laffont)"),
    ("0001103804", "Viking Global Investors"),
    ("0001138995", "Glenview Capital (Robbins)"),
    # === Macro / Family Offices ===
    ("0001350694", "Bridgewater Associates (Dalio)"),
    ("0001029160", "Soros Fund Management"),
    ("0001035674", "Paulson & Co"),
    ("0001536411", "Duquesne Family Office (Druckenmiller)"),
    ("0001166559", "Gates Foundation Trust"),
    # === Quants & Multi-Strat ===
    ("0001423053", "Citadel Advisors (Griffin)"),
    ("0001037389", "Renaissance Technologies"),
    ("0001478735", "Two Sigma Investments"),
    ("0001273087", "Millennium Management"),
    ("0001167557", "AQR Capital Management"),
    ("0001009207", "D.E. Shaw"),
    ("0001603466", "Point72 Asset Management (Cohen)"),
]
# Dédoublonnage défensif
WHALES = list({cik: name for cik, name in WHALES}.items())

# Fonds "lissage de risque" : multi-strat, quant, market-neutral. Détiennent
# des centaines de positions par convenance/couverture, donc leur présence
# sur un ticker n'est PAS un signal de conviction. À exclure quand on cherche
# du "smart money concentré". Identifiés par CIK pour être robuste aux changements
# de naming.
DIVERSIFIED_FUND_CIKS: set[str] = {
    "0001423053",  # Citadel Advisors (Griffin) — multi-strat
    "0001037389",  # Renaissance Technologies — quant HFT
    "0001478735",  # Two Sigma Investments — quant
    "0001273087",  # Millennium Management — multi-strat
    "0001167557",  # AQR Capital Management — quant systematic
    "0001009207",  # D.E. Shaw — multi-strat / quant
    "0001603466",  # Point72 Asset Management (Cohen) — multi-manager
    "0001350694",  # Bridgewater Associates (Dalio) — macro multi-strat
}


def is_concentrated_fund(cik: str) -> bool:
    """Retourne True si le fonds est de type 'high-conviction' (pas multi-strat/quant)."""
    return cik not in DIVERSIFIED_FUND_CIKS

_cache: dict = {}
_lock = threading.Lock()


def _cache_get(key: str, ttl: int):
    with _lock:
        entry = _cache.get(key)
        if entry is None:
            return None
        age = (datetime.utcnow() - entry["ts"]).total_seconds()
        if age > ttl:
            return None
        return entry["data"]


def _cache_set(key: str, data):
    with _lock:
        _cache[key] = {"data": data, "ts": datetime.utcnow()}


def _http_get(url: str, timeout: int = 20) -> Optional[str]:
    try:
        resp = httpx.get(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"}, timeout=timeout)
        resp.raise_for_status()
        return resp.text
    except Exception as e:
        logger.warning(f"SEC fetch error {url}: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────
# Mapping ticker → SEC company name
# ─────────────────────────────────────────────────────────────────────

def _get_company_tickers() -> dict[str, str]:
    """
    Retourne un dict { TICKER : SEC_OFFICIAL_NAME_UPPER }.
    Source : https://www.sec.gov/files/company_tickers.json (officiel SEC).
    """
    cached = _cache_get("company_tickers", TTL_TICKERS)
    if cached is not None:
        return cached

    txt = _http_get("https://www.sec.gov/files/company_tickers.json")
    if not txt:
        return {}
    import json
    try:
        raw = json.loads(txt)
    except Exception:
        return {}

    mapping: dict[str, str] = {}
    for entry in raw.values():
        ticker = (entry.get("ticker") or "").upper()
        name = (entry.get("title") or "").upper()
        if ticker and name:
            mapping[ticker] = name

    _cache_set("company_tickers", mapping)
    return mapping


_STOPWORDS = {"OF", "THE", "AND", "&", "A", "AN"}
_SUFFIXES = [
    # Ordre par longueur décroissante pour matcher le plus spécifique d'abord
    " CORPORATION", " HOLDINGS", " LIMITED", " COMPANY", " GROUP",
    " CLASS A", " CLASS B", " CLASS C", " CL A", " CL B", " CL C",
    " CORP", " INC", " LTD", " PLC", " CO", " LLC", " LP",
    " COM", " ORD", " /CALIFORNIA", " /DE", " /NEW", " NEW",
]


def _normalize_name(name: str) -> str:
    """
    Normalise un nom de société pour comparaison stricte.
    Retire suffixes corporate, ponctuation, stopwords. Ne tolère QUE l'égalité tokenisée.
    """
    n = name.upper().strip()
    # Retirer ponctuation -> espaces
    n = re.sub(r"[^\w\s]", " ", n)
    # Stripper suffixes corporate de manière itérative (au cas où plusieurs : "INC HOLDINGS")
    changed = True
    while changed:
        changed = False
        n_padded = " " + n + " "
        for s in _SUFFIXES:
            if n_padded.rstrip().endswith(s):
                n = n_padded.rstrip()[: -len(s)].strip()
                changed = True
                break
    # Tokenize + drop stopwords
    tokens = [t for t in n.split() if t and t not in _STOPWORDS]
    return " ".join(tokens)


def _names_match(a: str, b: str) -> bool:
    """
    Match strict après normalisation : exige égalité tokens-à-tokens.
    Évite les faux positifs type "APPLE INC" ↔ "APPLE HOSPITALITY REIT INC".
    """
    na = _normalize_name(a)
    nb = _normalize_name(b)
    if not na or not nb:
        return False
    return na == nb


# ─────────────────────────────────────────────────────────────────────
# 13-F filings
# ─────────────────────────────────────────────────────────────────────

def _find_latest_13f(cik: str) -> Optional[dict]:
    """Cherche le dernier 13F-HR via submissions API. Retourne {accession, filing_date}."""
    cik_clean = cik.lstrip("0").zfill(10)
    url = f"https://data.sec.gov/submissions/CIK{cik_clean}.json"
    txt = _http_get(url)
    if not txt:
        return None
    import json
    try:
        data = json.loads(txt)
    except Exception:
        return None

    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", []) or []
    for i, form in enumerate(forms):
        if form == "13F-HR":
            return {
                "accession": recent["accessionNumber"][i],
                "filing_date": recent["filingDate"][i],
                "report_date": recent.get("reportDate", [None] * len(forms))[i],
            }
    return None


def _find_infotable_url(cik: str, accession: str) -> Optional[str]:
    """
    Trouve l'URL du fichier infotable.xml dans le filing.
    Stratégie : lister le répertoire et prendre le .xml qui n'est pas primary_doc.xml.
    """
    cik_int = str(int(cik))
    accession_clean = accession.replace("-", "")
    folder_url = f"https://www.sec.gov/Archives/edgar/data/{cik_int}/{accession_clean}/"
    html = _http_get(folder_url)
    if not html:
        return None
    # Extraire les fichiers .xml
    matches = re.findall(r'href="([^"]+\.xml)"', html)
    for path in matches:
        if "primary_doc" in path.lower():
            continue
        # Sometimes path is absolute, sometimes relative
        if path.startswith("/"):
            return f"https://www.sec.gov{path}"
        if path.startswith("http"):
            return path
        return folder_url + path
    return None


def _parse_13f_xml(xml_text: str) -> list[dict]:
    """
    Parse l'infotable XML, agrège les positions par (nameOfIssuer + cusip).
    Retourne : [{name, cusip, value_usd, shares}, ...]
    """
    try:
        root = ET.fromstring(xml_text)
    except Exception as e:
        logger.warning(f"13-F XML parse error: {e}")
        return []

    # Le namespace varie selon les filings, on strippe
    def localname(tag: str) -> str:
        return tag.split("}", 1)[-1] if "}" in tag else tag

    aggregated: dict[tuple, dict] = {}
    for elem in root.iter():
        if localname(elem.tag) != "infoTable":
            continue
        name = ""
        cusip = ""
        value = 0
        shares = 0
        for child in elem:
            ln = localname(child.tag)
            if ln == "nameOfIssuer":
                name = (child.text or "").strip()
            elif ln == "cusip":
                cusip = (child.text or "").strip()
            elif ln == "value":
                try:
                    value = int(child.text or "0")
                except Exception:
                    value = 0
            elif ln == "shrsOrPrnAmt":
                for sub in child:
                    if localname(sub.tag) == "sshPrnamt":
                        try:
                            shares = int(sub.text or "0")
                        except Exception:
                            shares = 0

        if not name:
            continue
        key = (name.upper(), cusip)
        if key in aggregated:
            aggregated[key]["value_usd"] += value
            aggregated[key]["shares"] += shares
        else:
            aggregated[key] = {
                "name": name,
                "cusip": cusip,
                "value_usd": value,
                "shares": shares,
            }

    return list(aggregated.values())


def get_whale_positions(cik: str, fund_name: str) -> Optional[dict]:
    """
    Retourne les positions du dernier 13-F d'un fonds.
    Cache 7 jours.
    Format : {fund_name, filing_date, report_date, total_value, positions: [...]}.
    """
    cache_key = f"13f::{cik}"
    cached = _cache_get(cache_key, TTL_FILINGS)
    if cached is not None:
        return cached

    latest = _find_latest_13f(cik)
    if not latest:
        return None

    info_url = _find_infotable_url(cik, latest["accession"])
    if not info_url:
        return None

    xml_text = _http_get(info_url, timeout=30)
    if not xml_text:
        return None

    positions = _parse_13f_xml(xml_text)
    total_value = sum(p["value_usd"] for p in positions)

    result = {
        "fund_name": fund_name,
        "cik": cik,
        "filing_date": latest["filing_date"],
        "report_date": latest.get("report_date"),
        "total_value_usd": total_value,
        "positions": positions,
    }
    _cache_set(cache_key, result)
    return result


def _resolve_cusip(sec_name: str, all_whales: list[dict]) -> Optional[str]:
    """
    Identifie le CUSIP correspondant au sec_name en scannant tous les 13-F.
    Stratégie : on retient le CUSIP le plus fréquent parmi les positions dont le name match strictement.
    Robustesse : un CUSIP est unique par security, donc s'il est cité par 3 fonds qui ont tous écrit
    "APPLE INC" / "APPLE INC." / "APPLE  INC" → on capture la même security.
    """
    if not sec_name:
        return None
    cusip_votes: dict[str, int] = {}
    for whale in all_whales:
        for pos in whale["positions"]:
            if _names_match(pos["name"], sec_name) and pos["cusip"]:
                cusip_votes[pos["cusip"]] = cusip_votes.get(pos["cusip"], 0) + 1
    if not cusip_votes:
        return None
    # CUSIP le plus voté
    return max(cusip_votes.items(), key=lambda x: x[1])[0]


def get_whales_for_ticker(ticker: str, fallback_name: Optional[str] = None) -> dict:
    """
    Pour un ticker, retourne la liste des fonds qui le détiennent.

    Algorithme robuste en 2 passes :
      1. Lookup SEC official name via company_tickers.json
      2. Pass 1 (par name) : scan des 13-F → trouve le CUSIP qui correspond au sec_name
      3. Pass 2 (par CUSIP) : re-scan → récupère TOUTES les positions ayant ce CUSIP
         (capture les variantes de nom : "APPLE INC" vs "APPLE INC." vs "APPLE  INC")

    Format : {
        ticker, sec_name, cusip, count, holders: [...]
    }
    """
    ticker_u = ticker.upper()
    sec_names = _get_company_tickers()
    sec_name = sec_names.get(ticker_u) or (fallback_name or "").upper()

    # Charger tous les whales (cache hit après warm-up)
    all_whales: list[dict] = []
    for cik, fund_name in WHALES:
        whale = get_whale_positions(cik, fund_name)
        if whale:
            all_whales.append(whale)

    # Identifier le CUSIP via name match
    target_cusip = _resolve_cusip(sec_name, all_whales)

    holders = []
    for whale in all_whales:
        total = whale["total_value_usd"] or 1
        # Match prioritaire par CUSIP (gère les variantes de nom), fallback par name strict
        for pos in whale["positions"]:
            cusip_match = bool(target_cusip) and pos["cusip"] == target_cusip
            name_match = (not target_cusip) and bool(sec_name) and _names_match(pos["name"], sec_name)
            if cusip_match or name_match:
                holders.append({
                    "fund_name": whale["fund_name"],
                    "fund_cik": whale["cik"],
                    "issuer_name": pos["name"],
                    "cusip": pos["cusip"],
                    "value_usd": pos["value_usd"],
                    "shares": pos["shares"],
                    "position_pct": round(pos["value_usd"] / total * 100, 2),
                    "filing_date": whale["filing_date"],
                    "report_date": whale["report_date"],
                })
                break  # positions déjà agrégées par (name, cusip) — une seule entrée par fonds

    holders.sort(key=lambda h: h["value_usd"], reverse=True)

    return {
        "ticker": ticker_u,
        "sec_name": sec_name,
        "cusip": target_cusip,
        "count": len(holders),
        "holders": holders,
    }


def is_configured() -> bool:
    """Toujours True : SEC EDGAR ne nécessite pas de clé API, juste un UA."""
    return True


def trigger_background_refresh():
    """
    Pré-charge les 13-F des fonds suivis en arrière-plan au démarrage.
    Évite que la première requête utilisateur attende 20-30s.
    """
    def _refresh():
        try:
            # Pré-charge le mapping ticker → name SEC d'abord
            _get_company_tickers()
            # Puis chaque fonds (séquentiellement pour respecter les rate limits SEC : 10 req/s max)
            for cik, fund_name in WHALES:
                try:
                    get_whale_positions(cik, fund_name)
                except Exception as e:
                    logger.warning(f"SEC warm-up {fund_name}: {e}")
            logger.info(f"SEC EDGAR: {len(WHALES)} fonds pré-chargés.")
        except Exception as e:
            logger.warning(f"SEC EDGAR warm-up error: {e}")

    threading.Thread(target=_refresh, daemon=True).start()
