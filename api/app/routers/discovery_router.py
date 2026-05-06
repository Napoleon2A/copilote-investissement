"""
Routes : découverte d'opportunités via composition d'ETF thématiques.
  GET /discovery/etf-candidates    → univers thématique IA agrégé
  GET /discovery/etf/{ticker}      → top holdings d'un ETF spécifique
  GET /discovery/cross-signals     → tickers ETF thématiques ∩ tenus par super-investisseurs SEC 13-F
  GET /discovery/signals           → enrichissement batch (ETF, smart money, insider, politique)
  GET /discovery/smart-money-radar → opportunités issues directement des 13-F (initiations récentes)
"""
import asyncio
import logging
import math
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Query

from app.services import etf_holdings, sec_edgar, finnhub_ticker, political_trades

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/discovery", tags=["discovery"])

# Top 30 S&P 500 — par convention détenus par tout fonds liquide. Exclus par
# défaut pour focaliser sur les small/mid caps thématiques (vraies découvertes).
MEGA_CAPS = {
    "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "NVDA", "META", "BRK-B",
    "TSLA", "AVGO", "JPM", "V", "MA", "JNJ", "WMT", "PG", "UNH", "XOM",
    "ORCL", "COST", "HD", "BAC", "MRK", "ABBV", "KO", "NFLX", "CRM",
    "PEP", "TMO", "AMD",
}

# Default ultra-strict : ne garde que des fonds high-conviction (Pershing, Akre,
# Klarman, Tepper, Lone Pine, Berkshire). Cohérent avec la doctrine produit :
# au-delà de 30-40 positions, le signal smart-money est trop dilué.
DEFAULT_MAX_FUND_POSITIONS = 30

# Le radar smart-money (canal de découverte) utilise un seuil un peu plus
# tolérant que cross-signals : à 30 strict, le radar retourne presque toujours
# vide (les initiations récentes par fonds ≤ 30 pos sont rarissimes).
# 40 = limite haute du "concentrated" selon la doctrine, garde Lone Pine,
# rejette Loeb (50+) et Druckenmiller (80+).
RADAR_DEFAULT_MAX_FUND_POSITIONS = 40

# Seuil de signification du flux insider net : 5 points de base (0.05%) du market
# cap. Robuste cross-cap : pour une smallcap à 200M$ → ≥ 100k$ déjà significatif ;
# pour une mégacap à 1T$ → exige 500M$. Évite le bruit "insider à 100k$ sur Apple"
# et le faux négatif "insider à 80k$ sur une 150M$ smallcap".
INSIDER_SIGNIFICANCE_BPS = 5

# Demi-vie de pondération pour les transactions insider récentes : une transaction
# d'aujourd'hui pèse 1.0, à 30 jours 0.5, à 60 jours 0.25, etc. Aligné sur l'idée
# qu'un achat récent reflète mieux la conviction actuelle qu'un achat de 80 jours.
INSIDER_HALFLIFE_DAYS = 30

# Pondérations du combined_score :
#   - ETF count : signal thématique brut (poids 1.0, baseline)
#   - Whales count × 0.5 : validation smart-money, pondéré moitié pour éviter
#     que 5 fonds pas convaincus dominent 3 ETF thématiques bien ciblés
#   - Initiated count × 0.3 : bonus "vraie nouvelle conviction" — un fonds qui
#     ouvre vaut plus qu'un fonds qui hérite mais moins qu'une présence ETF
ETF_WEIGHT = 1.0
WHALES_WEIGHT = 0.5
INITIATED_WEIGHT = 0.3


def _is_foreign_listing(symbol: str) -> bool:
    """
    Détecte un listing non-US (hors couverture 13-F SEC).

    Convention Yahoo : un point indique un suffixe d'exchange (.TO Toronto,
    .KS Seoul, .L London, etc.). Les tickers US peuvent contenir un tiret pour
    distinguer les classes (BRK-A, BRK-B, RDS-A) — donc le tiret n'est PAS un
    indicateur d'étrangeté.
    """
    return "." in symbol


@router.get("/etf-candidates")
async def etf_candidates(
    min_etf_count: int = Query(default=1, ge=1, description="Filtre : nb minimum d'ETF où le ticker doit apparaître"),
    limit: int = Query(default=50, ge=1, le=200),
):
    """
    Univers AI value chain agrégé depuis 10 ETF thématiques (AIQ, BOTZ, CHAT,
    ROBO, SOXX, IGV, URNM, URA, NLR, ICLN). Trié par récurrence cross-ETF.

    Un ticker présent dans plusieurs ETF est un signal de pertinence thématique
    plus fort qu'un ticker isolé.
    """
    candidates = etf_holdings.get_unique_candidates()
    filtered = [c for c in candidates if c["etf_count"] >= min_etf_count]
    return {
        "total": len(filtered),
        "etfs_used": list(etf_holdings.THEMED_ETFS.keys()),
        "candidates": filtered[:limit],
    }


@router.get("/etf/{etf_ticker}")
async def etf_top_holdings(etf_ticker: str):
    """
    Top holdings d'un ETF (top 10 typiquement, dépend de yfinance).
    """
    holdings = etf_holdings.get_etf_holdings(etf_ticker)
    return {
        "etf": etf_ticker.upper(),
        "name": etf_holdings.THEMED_ETFS.get(etf_ticker.upper(), ""),
        "count": len(holdings),
        "holdings": holdings,
    }


@router.get("/cross-signals")
async def cross_signals(
    min_etf_count: int = Query(default=1, ge=1, description="Nb minimum d'ETF où le ticker apparaît"),
    min_whales: int = Query(default=1, ge=1, description="Nb minimum de fonds détenant le ticker"),
    exclude_mega: bool = Query(default=True, description="Exclure les 30 mégacaps S&P (Apple, Microsoft, etc.)"),
    concentrated_only: bool = Query(default=True, description="Ne compter que les fonds high-conviction (peu de positions)"),
    max_fund_positions: int = Query(default=DEFAULT_MAX_FUND_POSITIONS, ge=5, le=500, description="Si concentrated_only=True : nb max de positions pour qu'un fonds compte (30=ultra-strict, default ; 60=strict ; 100=large — au-delà le signal est dilué)"),
    limit: int = Query(default=30, ge=1, le=100),
):
    """
    Croisement ETF thématique × Super-investisseurs SEC 13-F.

    Pour chaque candidat de /etf-candidates, on regarde combien de fonds suivis
    (Berkshire, Pershing, Bridgewater, Citadel, Renaissance, etc.) le détiennent
    via leur dernier 13-F. Un ticker présent à la fois dans plusieurs ETF
    thématiques ET tenu par des smart-money fonds est un double signal fort.

    Note : seuls les listings US (NASDAQ/NYSE) sont couverts par les 13-F SEC.
    Les tickers étrangers (CCO.TO, KAP, 005930.KS) sont retournés mais avec
    whales_count=0 — les filtrer avec min_whales >= 1 si besoin.
    """
    candidates = etf_holdings.get_unique_candidates()
    candidates = [c for c in candidates if c["etf_count"] >= min_etf_count]
    if exclude_mega:
        candidates = [c for c in candidates if c["symbol"] not in MEGA_CAPS]

    enriched = []
    for c in candidates:
        symbol = c["symbol"]
        if _is_foreign_listing(symbol):
            whales_data = {"count": 0, "holders": []}
        else:
            whales_data = sec_edgar.get_whales_for_ticker(symbol, fallback_name=c["name"])

        all_holders = whales_data["holders"]
        if concentrated_only:
            holders = [
                h for h in all_holders
                if sec_edgar.is_concentrated_fund(h["fund_cik"], threshold=max_fund_positions)
            ]
        else:
            holders = all_holders

        whales_count = len(holders)
        if whales_count < min_whales:
            continue

        # Top 5 holders triés par concentration de portefeuille (position_pct)
        # plutôt que par valeur absolue : un fonds qui met 10% de son book sur
        # une position est un signal plus fort qu'un fonds qui met 1%.
        sorted_holders = sorted(holders, key=lambda h: -h["position_pct"])
        top_holders = [
            {
                "fund_name": h["fund_name"],
                "value_usd": h["value_usd"],
                "position_pct": h["position_pct"],
                "status": h.get("status"),
                "delta_pct": h.get("delta_pct"),
            }
            for h in sorted_holders[:5]
        ]
        initiated_count = sum(1 for h in holders if h.get("status") == "initiated")
        enriched.append({
            "symbol": symbol,
            "name": c["name"],
            "etf_count": c["etf_count"],
            "etfs": c["etfs"],
            "avg_etf_weight": c["avg_weight"],
            "whales_count": whales_count,
            "initiated_count": initiated_count,
            "top_holders": top_holders,
            "combined_score": (
                c["etf_count"] * ETF_WEIGHT
                + whales_count * WHALES_WEIGHT
                + initiated_count * INITIATED_WEIGHT
            ),
        })

    enriched.sort(key=lambda x: -x["combined_score"])
    return {
        "total": len(enriched),
        "min_etf_count": min_etf_count,
        "min_whales": min_whales,
        "candidates": enriched[:limit],
    }


def _build_etf_signal(symbol: str, etf_index: dict) -> dict:
    """ETF signal pour un ticker : présence dans les ETF thématiques."""
    info = etf_index.get(symbol)
    if not info:
        return {"present": False, "etf_count": 0, "etfs": []}
    return {
        "present": True,
        "etf_count": info["etf_count"],
        "etfs": info["etfs"],
        "avg_weight": info["avg_weight"],
    }


def _build_smart_money_signal(symbol: str, max_fund_positions: int = DEFAULT_MAX_FUND_POSITIONS) -> dict:
    """
    Smart money 13-F : holders concentrés + initiations.

    Expose la fraîcheur (`latest_report_date`, `latest_filing_date`) pour que
    l'utilisateur sache s'il regarde un 13-F frais (T-45j) ou stale (T-100j).
    Le 13-F est trimestriel, le retard structurel est ≥ 45 jours.
    """
    if _is_foreign_listing(symbol):
        return {
            "present": False, "concentrated_holders": 0, "initiated": 0,
            "highlights": [], "latest_report_date": None, "latest_filing_date": None,
            "freshness_days": None,
        }
    data = sec_edgar.get_whales_for_ticker(symbol)
    holders = [
        h for h in data["holders"]
        if sec_edgar.is_concentrated_fund(h["fund_cik"], threshold=max_fund_positions)
    ]
    initiated = [h for h in holders if h.get("status") == "initiated"]
    sorted_h = sorted(holders, key=lambda h: -h["position_pct"])
    highlights = [
        {
            "fund_name": h["fund_name"],
            "status": h.get("status"),
            "position_pct": h["position_pct"],
            "delta_pct": h.get("delta_pct"),
            "report_date": h.get("report_date"),
            "filing_date": h.get("filing_date"),
        }
        for h in sorted_h[:3]
    ]
    # Fraîcheur globale = date du 13-F le plus récent parmi les holders concentrés
    latest_report = max((h.get("report_date") for h in holders if h.get("report_date")), default=None)
    latest_filing = max((h.get("filing_date") for h in holders if h.get("filing_date")), default=None)
    freshness_days = None
    if latest_filing:
        try:
            d = datetime.strptime(str(latest_filing), "%Y-%m-%d").date()
            freshness_days = (date.today() - d).days
        except (ValueError, TypeError):
            pass
    return {
        "present": bool(holders),
        "concentrated_holders": len(holders),
        "initiated": len(initiated),
        "highlights": highlights,
        "latest_report_date": str(latest_report) if latest_report else None,
        "latest_filing_date": str(latest_filing) if latest_filing else None,
        "freshness_days": freshness_days,
    }


def _build_insider_signal(symbol: str) -> dict:
    """
    Insider top management : net achats / ventes 90j via Finnhub.

    Deux raffinements vs un net brut :
      1. Significativité calibrée sur market cap (seuil bps), pas sur 100k$ absolu.
      2. Pondération récence par décroissance exponentielle (demi-vie 30j) : un
         achat aujourd'hui pèse 1.0, à 30 jours 0.5, à 60 jours 0.25. Reflète
         mieux la conviction actuelle qu'un net non pondéré sur 90 jours.
    """
    if "." in symbol:
        return {
            "present": False, "net_value_usd": 0, "buy_count": 0, "sell_count": 0,
            "buy_value_usd": 0, "sell_value_usd": 0,
            "net_value_weighted_usd": 0,
            "net_pct_market_cap_bps": None, "is_significant": False,
            "latest_transaction_date": None,
        }
    transactions = finnhub_ticker.get_insider_transactions(symbol)
    summary = finnhub_ticker.insider_summary(transactions)

    today = date.today()
    buy_value = 0.0
    sell_value = 0.0
    buy_value_weighted = 0.0
    sell_value_weighted = 0.0
    buy_count = 0
    sell_count = 0
    latest_tx_date: Optional[str] = None
    for t in transactions:
        change = t.get("change") or 0
        price = t.get("transactionPrice") or 0
        code = t.get("transactionCode")
        tx_date_str = t.get("transactionDate")
        # Pondération par récence (exp decay)
        weight = 1.0
        if tx_date_str:
            if latest_tx_date is None or tx_date_str > latest_tx_date:
                latest_tx_date = tx_date_str
            try:
                d = datetime.strptime(tx_date_str, "%Y-%m-%d").date()
                age_days = max(0, (today - d).days)
                weight = math.pow(0.5, age_days / INSIDER_HALFLIFE_DAYS)
            except ValueError:
                weight = 0.5  # date pourrie → pondération moyenne défensive
        # On compte uniquement les transactions discrétionnaires : P (purchase)
        # côté achat, S (sale) côté vente. On exclut A (award/grant), M (option
        # exercise), F (tax-related disposition) qui ne reflètent pas une
        # décision d'investissement.
        value = abs(change) * price
        if change > 0 and code == "P":
            buy_value += value
            buy_value_weighted += value * weight
            buy_count += 1
        elif change < 0 and code == "S":
            sell_value += value
            sell_value_weighted += value * weight
            sell_count += 1
    net_value = buy_value - sell_value
    net_value_weighted = buy_value_weighted - sell_value_weighted

    profile = finnhub_ticker.get_profile(symbol) or {}
    market_cap_musd = profile.get("marketCapitalization") or 0  # en millions $
    market_cap_usd = market_cap_musd * 1_000_000

    if market_cap_usd > 0:
        net_pct_bps = (net_value / market_cap_usd) * 10_000
        is_significant = abs(net_pct_bps) >= INSIDER_SIGNIFICANCE_BPS
    else:
        # Fallback sans market cap : seuil absolu 250k$
        net_pct_bps = None
        is_significant = abs(net_value) >= 250_000

    return {
        "present": summary["count"] > 0,
        "net_value_usd": round(net_value, 0),
        "net_value_weighted_usd": round(net_value_weighted, 0),
        "buy_value_usd": round(buy_value, 0),
        "sell_value_usd": round(sell_value, 0),
        "buy_count": buy_count,
        "sell_count": sell_count,
        "transactions_count": summary["count"],
        "net_pct_market_cap_bps": round(net_pct_bps, 1) if net_pct_bps is not None else None,
        "is_significant": is_significant,
        "latest_transaction_date": latest_tx_date,
    }


@router.get("/signals")
async def signals_batch(
    tickers: str = Query(..., description="Liste de tickers séparés par virgule (ex: VRT,IREN,EOSE)"),
    max_fund_positions: int = Query(default=DEFAULT_MAX_FUND_POSITIONS, ge=5, le=500),
):
    """
    Enrichissement batch d'une liste de tickers avec 4 angles de validation :
      1. ETF thématiques : présence dans AIQ/BOTZ/CHAT/SOXX/URNM/...
      2. Smart money 13-F : fonds high-conviction qui détiennent (status initiated/increased)
      3. Insider top management : net achats / ventes (90j via Finnhub) — significativité
         calibrée sur market cap (5 bps) plutôt qu'un seuil absolu trompeur cross-cap
      4. Trades politiques : Pelosi & Co (STUB pour l'instant — source non branchée,
         champ source_available=false ; cf. memory/project_todo_political_trades)

    PRINCIPE : ces signaux annotent, ils ne filtrent JAMAIS. Une opportunité
    sans aucun signal coché reste une opportunité valide — c'est juste qu'on
    n'a pas d'information complémentaire dessus.

    Performance : les 4 angles sont calculés en parallèle pour chaque ticker via
    asyncio.gather, puis tous les tickers sont traités également en parallèle.
    Les services sous-jacents sont cached (TTL 5-30 min) donc les appels HTTP
    réels ne se déclenchent qu'au premier ticker froid.
    """
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    etf_index = {c["symbol"]: c for c in etf_holdings.get_unique_candidates()}

    def _safe(label: str, sym: str, fn, *args):
        """Wrap un builder pour ne jamais propager : retourne un placeholder
        d'erreur typé que le frontend peut afficher comme "donnée indisponible"."""
        try:
            return fn(*args)
        except Exception as e:
            logger.warning(f"[signals] {label}({sym}) failed: {e}")
            return {"present": False, "error": str(e)[:120]}

    async def _build_one(sym: str) -> tuple[str, dict]:
        # to_thread car les services sous-jacents sont synchrones (httpx sync,
        # parsing XML). Permet d'occuper le worker pool pendant les I/O réseau
        # plutôt que de bloquer l'event loop sur N tickers en série.
        etf, smart, insider, political = await asyncio.gather(
            asyncio.to_thread(_safe, "etf", sym, _build_etf_signal, sym, etf_index),
            asyncio.to_thread(_safe, "smart_money", sym, _build_smart_money_signal, sym, max_fund_positions),
            asyncio.to_thread(_safe, "insider", sym, _build_insider_signal, sym),
            asyncio.to_thread(_safe, "political", sym, political_trades.get_political_trades_for_ticker, sym),
        )
        return sym, {
            "etf": etf,
            "smart_money": smart,
            "insider": insider,
            "political": political,
        }

    # return_exceptions=True : si un ticker plante au niveau gather, on continue
    # quand même les autres et on retourne un placeholder pour celui qui plante.
    results = await asyncio.gather(
        *[_build_one(s) for s in ticker_list],
        return_exceptions=True,
    )
    out: dict[str, dict] = {}
    for sym, item in zip(ticker_list, results):
        if isinstance(item, BaseException):
            logger.error(f"[signals] {sym} failed entirely: {item}")
            out[sym] = {
                "etf": {"present": False, "etf_count": 0, "etfs": []},
                "smart_money": {"present": False, "concentrated_holders": 0, "initiated": 0, "highlights": []},
                "insider": {"present": False, "is_significant": False},
                "political": {"source_available": False, "count": 0, "highlights": []},
                "error": str(item)[:200],
            }
        else:
            out[item[0]] = item[1]
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Smart-money radar : opportunités issues directement des 13-F (initiations)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/smart-money-radar")
async def smart_money_radar(
    max_fund_positions: int = Query(default=RADAR_DEFAULT_MAX_FUND_POSITIONS, ge=5, le=500),
    min_funds: int = Query(default=1, ge=1, le=10, description="Nb minimum de fonds high-conviction qui ont initié/augmenté"),
    exclude_mega: bool = Query(default=True),
    limit: int = Query(default=20, ge=1, le=50),
):
    """
    Canal de découverte indépendant du scanner classique : remonte les tickers
    sur lesquels ≥ N fonds high-conviction ont **initié** ou **augmenté
    significativement** (delta_pct ≥ 50%) leur position au dernier 13-F.

    Le scanner momentum/scoring peut passer à côté de ces opportunités si le
    score composite est faible (ex: chute de prix récente). Mais une initiation
    par un fonds ultra-concentré est précisément un signal *contrarian* qui
    mérite d'être visible.

    Retour : liste triée par "force du signal" (initiations > augmentations).
    """
    import time
    t0 = time.time()

    # Pour ne pas re-faire un scan exhaustif : on part des candidats ETF (~75
    # tickers thématiques pertinents) plutôt que de scanner toutes les positions
    # de tous les fonds. Ça aligne le radar avec ta thèse (chaîne IA).
    candidates = etf_holdings.get_unique_candidates()
    if exclude_mega:
        candidates = [c for c in candidates if c["symbol"] not in MEGA_CAPS]

    def _scan(sym: str, name: str) -> Optional[dict]:
        if _is_foreign_listing(sym):
            return None
        try:
            data = sec_edgar.get_whales_for_ticker(sym, fallback_name=name)
        except Exception as e:
            logger.debug(f"[radar] whales lookup {sym} failed: {e}")
            return None
        holders = [
            h for h in data["holders"]
            if sec_edgar.is_concentrated_fund(h["fund_cik"], threshold=max_fund_positions)
        ]
        initiated = [h for h in holders if h.get("status") == "initiated"]
        # "Augmenté significativement" : delta_pct >= 50% (signal de conviction)
        increased = [
            h for h in holders
            if h.get("status") == "increased" and (h.get("delta_pct") or 0) >= 50
        ]
        bullish_count = len(initiated) + len(increased)
        if bullish_count < min_funds:
            return None
        sorted_h = sorted(initiated + increased, key=lambda h: -h["position_pct"])
        return {
            "symbol": sym,
            "name": name,
            "initiated_count": len(initiated),
            "increased_count": len(increased),
            "bullish_count": bullish_count,
            "concentrated_holders": len(holders),
            "highlights": [
                {
                    "fund_name": h["fund_name"],
                    "status": h.get("status"),
                    "position_pct": h["position_pct"],
                    "delta_pct": h.get("delta_pct"),
                    "report_date": h.get("report_date"),
                }
                for h in sorted_h[:5]
            ],
            # Score : initiations valent 2× les augmentations (conviction nouvelle)
            "score": len(initiated) * 2 + len(increased) * 1,
        }

    results = await asyncio.gather(
        *[asyncio.to_thread(_scan, c["symbol"], c["name"]) for c in candidates],
        return_exceptions=True,
    )
    radar = [r for r in results if isinstance(r, dict) and r is not None]
    radar.sort(key=lambda x: (-x["score"], -x["bullish_count"]))

    return {
        "total": len(radar),
        "limit": limit,
        "min_funds": min_funds,
        "max_fund_positions": max_fund_positions,
        "duration_seconds": round(time.time() - t0, 1),
        "radar": radar[:limit],
    }
