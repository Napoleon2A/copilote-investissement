"""
Service de recherche web — Sources externes gratuites (hors yfinance)

Ce module collecte des données complémentaires à yfinance depuis des sources
publiques gratuites, sans clé API :

  - Google News RSS : actualités récentes sur un ticker ou un thème
  - SEC EDGAR : filings réglementaires (10-K, 10-Q, 8-K) via API publique
  - Scraping web : extraction du contenu textuel d'une page (site corporate, etc.)
  - Analyse concurrentielle : comparaison des peers d'un même secteur

Toutes les fonctions sont synchrones, avec cache mémoire (TTL 1h) et
gestion d'erreurs gracieuse (retour vide/None en cas d'échec).

Dépendance optionnelle : beautifulsoup4 (pour fetch_company_website_summary).
Si absent, un fallback regex est utilisé (moins précis mais fonctionnel).
"""

import logging
import re
import time
import urllib.request
import urllib.parse
import urllib.error
import json
import xml.etree.ElementTree as ET
from typing import Optional

logger = logging.getLogger(__name__)

# ── Cache mémoire — même pattern que data_service.py ────────────────────────
# Clé = (fonction, args), valeur = (timestamp, data).
# TTL : 1h pour toutes les données web (moins volatiles que les prix).
_cache: dict[tuple, tuple[float, object]] = {}
_CACHE_TTL_WEB = 3600  # 1 heure


def _cache_get(key: tuple, ttl: int = _CACHE_TTL_WEB) -> object | None:
    """Retourne la valeur en cache si elle existe et n'est pas expirée."""
    entry = _cache.get(key)
    if entry and (time.time() - entry[0]) < ttl:
        return entry[1]
    return None


def _cache_set(key: tuple, value: object) -> None:
    """Stocke une valeur en cache avec le timestamp courant."""
    _cache[key] = (time.time(), value)


# ── User-Agent pour les requêtes HTTP ────────────────────────────────────────
# SEC EDGAR exige un User-Agent identifiant l'application et un contact.
_SEC_USER_AGENT = "Austerlitz HedgeFund jean.natali@laposte.net"
_GENERIC_USER_AGENT = "Mozilla/5.0 (compatible; AusterlitzBot/1.0)"


# ── Détection BeautifulSoup ──────────────────────────────────────────────────
try:
    from bs4 import BeautifulSoup
    _HAS_BS4 = True
except ImportError:
    _HAS_BS4 = False
    logger.info("beautifulsoup4 non installé — fallback regex pour le scraping web")


# =============================================================================
# 1. Google News RSS
# =============================================================================

def fetch_google_news(query: str, max_results: int = 10) -> list[dict]:
    """
    Récupère les actualités récentes depuis le flux RSS de Google News.

    Args:
        query: Terme de recherche (ex: "AAPL", "NVIDIA earnings", "Fed rate decision")
        max_results: Nombre max de résultats (défaut 10)

    Returns:
        Liste de dicts avec : title, source, date, link.
        Liste vide si échec.

    Note: Google News RSS est gratuit et sans authentification.
    Le flux retourne du XML avec des items <item> contenant
    <title>, <link>, <pubDate>, <source>.
    """
    cache_key = ("google_news", query, max_results)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        encoded_query = urllib.parse.quote(query)
        url = f"https://news.google.com/rss/search?q={encoded_query}&hl=en-US&gl=US&ceid=US:en"

        req = urllib.request.Request(url, headers={"User-Agent": _GENERIC_USER_AGENT})
        with urllib.request.urlopen(req, timeout=10) as response:
            xml_data = response.read().decode("utf-8")

        root = ET.fromstring(xml_data)
        channel = root.find("channel")
        if channel is None:
            logger.warning(f"Google News RSS: pas de channel pour query='{query}'")
            return []

        results: list[dict] = []
        for item in channel.findall("item"):
            if len(results) >= max_results:
                break

            title_el = item.find("title")
            link_el = item.find("link")
            pub_date_el = item.find("pubDate")
            source_el = item.find("source")

            results.append({
                "title": title_el.text if title_el is not None else "",
                "source": source_el.text if source_el is not None else "",
                "date": pub_date_el.text if pub_date_el is not None else "",
                "link": link_el.text if link_el is not None else "",
            })

        _cache_set(cache_key, results)
        logger.debug(f"Google News: {len(results)} résultats pour '{query}'")
        return results

    except urllib.error.URLError as e:
        logger.error(f"Google News RSS: erreur réseau pour '{query}': {e}")
        return []
    except ET.ParseError as e:
        logger.error(f"Google News RSS: erreur parsing XML pour '{query}': {e}")
        return []
    except Exception as e:
        logger.error(f"Google News RSS: erreur inattendue pour '{query}': {e}")
        return []


# =============================================================================
# 2. SEC EDGAR — Filings réglementaires
# =============================================================================

# Mapping ticker → CIK (Central Index Key) pour les entreprises les plus courantes.
# Pour les autres, on fait une recherche via l'API SEC.
_TICKER_TO_CIK: dict[str, str] = {}


def _lookup_cik(ticker: str) -> Optional[str]:
    """
    Résout un ticker en CIK via le fichier company_tickers.json de la SEC.
    Le CIK est l'identifiant unique d'une entreprise dans EDGAR.
    Cache le mapping en mémoire pour éviter de re-fetcher.
    """
    ticker_upper = ticker.upper()

    # Vérifier le cache local
    if ticker_upper in _TICKER_TO_CIK:
        return _TICKER_TO_CIK[ticker_upper]

    try:
        url = "https://www.sec.gov/files/company_tickers.json"
        req = urllib.request.Request(url, headers={
            "User-Agent": _SEC_USER_AGENT,
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode("utf-8"))

        # Le JSON est un dict dont les clés sont des index numériques
        # Chaque valeur contient : cik_str, ticker, title
        for entry in data.values():
            t = entry.get("ticker", "").upper()
            cik = str(entry.get("cik_str", ""))
            if t:
                _TICKER_TO_CIK[t] = cik

        return _TICKER_TO_CIK.get(ticker_upper)

    except Exception as e:
        logger.error(f"SEC CIK lookup: erreur pour '{ticker}': {e}")
        return None


def fetch_sec_filing_summary(ticker: str) -> list[dict]:
    """
    Récupère la liste des filings SEC récents pour un ticker US.

    Utilise l'API publique EDGAR (data.sec.gov) qui exige un User-Agent
    identifiant l'application et un email de contact.

    Args:
        ticker: Ticker US (ex: "AAPL", "MSFT")

    Returns:
        Liste de dicts avec : filing_type, date, description, accession_number.
        Liste vide si le ticker n'est pas trouvé ou si erreur.
        Ne retourne que les filings 10-K, 10-Q et 8-K (les plus utiles).

    Note: Ne récupère PAS le contenu du filing, uniquement les métadonnées.
    Le contenu complet est disponible via l'accession_number mais c'est
    du HTML/XBRL lourd à parser — on fera ça dans une version future.
    """
    cache_key = ("sec_filings", ticker.upper())
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        cik = _lookup_cik(ticker)
        if not cik:
            logger.warning(f"SEC EDGAR: CIK introuvable pour '{ticker}'")
            return []

        # L'API EDGAR attend le CIK paddé à 10 chiffres
        cik_padded = cik.zfill(10)
        url = f"https://data.sec.gov/submissions/CIK{cik_padded}.json"

        req = urllib.request.Request(url, headers={
            "User-Agent": _SEC_USER_AGENT,
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))

        recent = data.get("filings", {}).get("recent", {})
        if not recent:
            logger.warning(f"SEC EDGAR: pas de filings récents pour '{ticker}'")
            return []

        forms = recent.get("form", [])
        dates = recent.get("filingDate", [])
        descriptions = recent.get("primaryDocDescription", [])
        accessions = recent.get("accessionNumber", [])

        # Filtrer uniquement les types de filings utiles pour l'analyse
        target_forms = {"10-K", "10-Q", "8-K", "10-K/A", "10-Q/A", "8-K/A"}

        results: list[dict] = []
        for i in range(min(len(forms), len(dates))):
            form_type = forms[i] if i < len(forms) else ""
            if form_type not in target_forms:
                continue

            results.append({
                "filing_type": form_type,
                "date": dates[i] if i < len(dates) else "",
                "description": descriptions[i] if i < len(descriptions) else "",
                "accession_number": accessions[i] if i < len(accessions) else "",
            })

            # On garde les 20 derniers filings pertinents max
            if len(results) >= 20:
                break

        _cache_set(cache_key, results)
        logger.debug(f"SEC EDGAR: {len(results)} filings pour '{ticker}'")
        return results

    except urllib.error.HTTPError as e:
        logger.error(f"SEC EDGAR: HTTP {e.code} pour '{ticker}': {e.reason}")
        return []
    except Exception as e:
        logger.error(f"SEC EDGAR: erreur pour '{ticker}': {e}")
        return []


# =============================================================================
# 3. Scraping web — Extraction de contenu textuel
# =============================================================================

def _strip_html_regex(html: str) -> str:
    """
    Fallback sans BeautifulSoup : supprime les tags HTML avec des regex.
    Moins précis que BS4 mais fonctionnel pour du contenu simple.
    """
    # Supprimer les blocs script et style entièrement
    text = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.DOTALL | re.IGNORECASE)
    # Supprimer les commentaires HTML
    text = re.sub(r"<!--.*?-->", " ", text, flags=re.DOTALL)
    # Supprimer tous les tags
    text = re.sub(r"<[^>]+>", " ", text)
    # Décoder les entités HTML basiques
    text = text.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    text = text.replace("&quot;", '"').replace("&nbsp;", " ").replace("&#39;", "'")
    # Nettoyer les espaces multiples
    text = re.sub(r"\s+", " ", text).strip()
    return text


def fetch_company_website_summary(url: str, max_chars: int = 2000) -> Optional[str]:
    """
    Récupère le contenu textuel principal d'une page web.

    Utile pour lire la page "About" ou "Investors" d'un site corporate,
    un article de presse, ou toute page publique.

    Args:
        url: URL complète (ex: "https://investor.apple.com/")
        max_chars: Taille max du texte retourné (défaut 2000 caractères)

    Returns:
        Texte nettoyé tronqué à max_chars, ou None si échec.

    Note: Utilise BeautifulSoup si disponible, sinon fallback regex.
    Les balises nav, footer, header, script, style sont supprimées.
    """
    cache_key = ("website_summary", url)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": _GENERIC_USER_AGENT,
            "Accept": "text/html",
            "Accept-Language": "en-US,en;q=0.9",
        })
        with urllib.request.urlopen(req, timeout=15) as response:
            # Limiter la lecture à 500 KB pour éviter de charger des pages énormes
            raw = response.read(500_000)

        # Détecter l'encoding
        content_type = response.headers.get("Content-Type", "")
        charset = "utf-8"
        if "charset=" in content_type:
            charset = content_type.split("charset=")[-1].strip().split(";")[0]

        try:
            html = raw.decode(charset, errors="replace")
        except (LookupError, UnicodeDecodeError):
            html = raw.decode("utf-8", errors="replace")

        # Extraction du texte
        if _HAS_BS4:
            soup = BeautifulSoup(html, "html.parser")
            # Supprimer les éléments non-content
            for tag in soup.find_all(["script", "style", "nav", "footer", "header",
                                       "aside", "noscript", "iframe", "form"]):
                tag.decompose()
            text = soup.get_text(separator=" ", strip=True)
        else:
            # Fallback regex — supprimer nav/footer/header par approximation
            html = re.sub(r"<nav[^>]*>.*?</nav>", " ", html, flags=re.DOTALL | re.IGNORECASE)
            html = re.sub(r"<footer[^>]*>.*?</footer>", " ", html, flags=re.DOTALL | re.IGNORECASE)
            html = re.sub(r"<header[^>]*>.*?</header>", " ", html, flags=re.DOTALL | re.IGNORECASE)
            html = re.sub(r"<aside[^>]*>.*?</aside>", " ", html, flags=re.DOTALL | re.IGNORECASE)
            text = _strip_html_regex(html)

        # Nettoyer les espaces et tronquer
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) > max_chars:
            # Couper à la fin d'une phrase si possible
            cut_point = text.rfind(". ", 0, max_chars)
            if cut_point > max_chars * 0.7:
                text = text[:cut_point + 1]
            else:
                text = text[:max_chars] + "..."

        if not text:
            logger.warning(f"Scraping web: aucun contenu extrait de '{url}'")
            return None

        _cache_set(cache_key, text)
        logger.debug(f"Scraping web: {len(text)} caractères extraits de '{url}'")
        return text

    except urllib.error.HTTPError as e:
        logger.error(f"Scraping web: HTTP {e.code} pour '{url}'")
        return None
    except urllib.error.URLError as e:
        logger.error(f"Scraping web: erreur réseau pour '{url}': {e.reason}")
        return None
    except Exception as e:
        logger.error(f"Scraping web: erreur pour '{url}': {e}")
        return None


# =============================================================================
# 4. Analyse concurrentielle
# =============================================================================

def research_competitors(ticker: str, sector: str | None = None) -> list[dict]:
    """
    Compare un ticker à ses peers du même secteur dans SCAN_UNIVERSE.

    Pour chaque concurrent trouvé, récupère :
      - prix actuel et variation 1M/3M/YTD
      - marges (operating, net)
      - croissance revenue
      - P/E ratio
      - market cap

    Args:
        ticker: Ticker à analyser (ex: "NVDA")
        sector: Nom du secteur dans SCAN_UNIVERSE (optionnel).
                Si None, on cherche le secteur du ticker automatiquement.

    Returns:
        Liste de dicts, un par concurrent. Liste vide si aucun peer trouvé.

    Note: Utilise SCAN_UNIVERSE de scanner.py pour identifier les peers,
    et data_service.py pour les données. Pas d'appel externe supplémentaire.
    """
    cache_key = ("competitors", ticker.upper(), sector)
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        from app.services.scanner import SCAN_UNIVERSE
        from app.services.data_service import get_fundamentals, get_price_changes, get_company_info

        ticker_upper = ticker.upper()

        # Trouver le secteur du ticker si non fourni
        peer_tickers: list[str] = []
        matched_sector: str = ""

        if sector:
            # Chercher dans le secteur spécifié
            tickers_in_sector = SCAN_UNIVERSE.get(sector, [])
            peer_tickers = [t for t in tickers_in_sector if t.upper() != ticker_upper]
            matched_sector = sector
        else:
            # Chercher dans quel secteur se trouve le ticker
            for sec_name, sec_tickers in SCAN_UNIVERSE.items():
                if ticker_upper in [t.upper() for t in sec_tickers]:
                    peer_tickers = [t for t in sec_tickers if t.upper() != ticker_upper]
                    matched_sector = sec_name
                    break

        if not peer_tickers:
            logger.info(f"Competitors: aucun peer trouvé pour '{ticker}' (secteur: {sector})")
            return []

        results: list[dict] = []
        for peer in peer_tickers:
            try:
                info = get_company_info(peer)
                fundamentals = get_fundamentals(peer)
                changes = get_price_changes(peer)

                if not fundamentals and not changes:
                    continue

                results.append({
                    "ticker": peer,
                    "name": (info.get("longName") or info.get("shortName") or peer) if info else peer,
                    "sector": matched_sector,
                    "current_price": changes.get("current_price") if changes else None,
                    "change_1m": changes.get("change_1m") if changes else None,
                    "change_3m": changes.get("change_3m") if changes else None,
                    "change_ytd": changes.get("change_ytd") if changes else None,
                    "pct_from_52w_high": changes.get("pct_from_52w_high") if changes else None,
                    "pe_ratio": fundamentals.get("pe_ratio"),
                    "forward_pe": fundamentals.get("forward_pe"),
                    "operating_margin": fundamentals.get("operating_margin"),
                    "net_margin": fundamentals.get("net_margin"),
                    "revenue_growth": fundamentals.get("revenue_growth"),
                    "roe": fundamentals.get("roe"),
                    "market_cap": fundamentals.get("market_cap"),
                    "ev_to_ebitda": fundamentals.get("ev_to_ebitda"),
                })
            except Exception as e:
                logger.warning(f"Competitors: erreur sur peer '{peer}': {e}")
                continue

        _cache_set(cache_key, results)
        logger.debug(f"Competitors: {len(results)} peers trouvés pour '{ticker}' ({matched_sector})")
        return results

    except ImportError as e:
        logger.error(f"Competitors: import manquant: {e}")
        return []
    except Exception as e:
        logger.error(f"Competitors: erreur pour '{ticker}': {e}")
        return []
