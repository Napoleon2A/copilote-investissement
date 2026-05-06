"""
Routes : découverte d'opportunités via composition d'ETF thématiques.
  GET /discovery/etf-candidates → univers thématique IA agrégé
  GET /discovery/etf/{ticker}   → top holdings d'un ETF spécifique
  GET /discovery/cross-signals  → tickers ETF thématiques ∩ tenus par super-investisseurs SEC 13-F
"""
from fastapi import APIRouter, Query

from app.services import etf_holdings, sec_edgar, finnhub_ticker, political_trades

router = APIRouter(prefix="/discovery", tags=["discovery"])

# Top 30 S&P 500 — par convention détenus par tout fonds liquide. Exclus par
# défaut pour focaliser sur les small/mid caps thématiques (vraies découvertes).
MEGA_CAPS = {
    "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "NVDA", "META", "BRK-B",
    "TSLA", "AVGO", "JPM", "V", "MA", "JNJ", "WMT", "PG", "UNH", "XOM",
    "ORCL", "COST", "HD", "BAC", "MRK", "ABBV", "KO", "NFLX", "CRM",
    "PEP", "TMO", "AMD",
}


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
    max_fund_positions: int = Query(default=60, ge=5, le=500, description="Si concentrated_only=True : nb max de positions pour qu'un fonds compte (40=ultra-strict ne garde que Pershing/Akre/Klarman/Tepper/Lone Pine/Berkshire ; 60=strict inclut Loeb/Coatue/Tiger/Druckenmiller ; 100=large)"),
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

    Tri : (etf_count + whales_count*0.5) décroissant — l'ETF count est le signal
    thématique, les whales sont un bonus de validation smart-money.
    """
    candidates = etf_holdings.get_unique_candidates()
    candidates = [c for c in candidates if c["etf_count"] >= min_etf_count]
    if exclude_mega:
        candidates = [c for c in candidates if c["symbol"] not in MEGA_CAPS]

    enriched = []
    for c in candidates:
        symbol = c["symbol"]
        # Skip rapide pour les tickers étrangers (point dans le ticker = listing
        # non-US, hors couverture 13-F)
        if "." in symbol or "-" in symbol[3:]:
            whales_data = {"count": 0, "holders": []}
        else:
            whales_data = sec_edgar.get_whales_for_ticker(symbol, fallback_name=c["name"])

        # Filtre concentrated : ne garde que les fonds high-conviction
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
                # Comparaison N vs N-1 : permet de détecter les "initiated"
                # (vraie nouvelle conviction, pas juste position héritée)
                "status": h.get("status"),
                "delta_pct": h.get("delta_pct"),
            }
            for h in sorted_holders[:5]
        ]
        # Compte des positions naissantes (signal "smart money entre maintenant")
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
            # Score boosté par les initiations : 0.3 par position naissante
            "combined_score": c["etf_count"] + whales_count * 0.5 + initiated_count * 0.3,
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


def _build_smart_money_signal(symbol: str, max_fund_positions: int = 60) -> dict:
    """Smart money 13-F : holders concentrés + initiations."""
    if "." in symbol or "-" in symbol[3:]:
        return {"present": False, "concentrated_holders": 0, "initiated": 0, "highlights": []}
    data = sec_edgar.get_whales_for_ticker(symbol)
    holders = [
        h for h in data["holders"]
        if sec_edgar.is_concentrated_fund(h["fund_cik"], threshold=max_fund_positions)
    ]
    initiated = [h for h in holders if h.get("status") == "initiated"]
    # Top 3 highlights par concentration de portefeuille
    sorted_h = sorted(holders, key=lambda h: -h["position_pct"])
    highlights = [
        {
            "fund_name": h["fund_name"],
            "status": h.get("status"),
            "position_pct": h["position_pct"],
            "delta_pct": h.get("delta_pct"),
        }
        for h in sorted_h[:3]
    ]
    return {
        "present": bool(holders),
        "concentrated_holders": len(holders),
        "initiated": len(initiated),
        "highlights": highlights,
    }


def _build_insider_signal(symbol: str) -> dict:
    """Insider top management : net achats / ventes 90j via Finnhub."""
    if "." in symbol:
        return {"present": False, "net_value_usd": 0, "buy_count": 0, "sell_count": 0}
    transactions = finnhub_ticker.get_insider_transactions(symbol)
    summary = finnhub_ticker.insider_summary(transactions)
    # On compte achats/ventes en transactions (pas en shares) pour l'UI
    buys = sum(1 for t in transactions if (t.get("change") or 0) > 0 and t.get("transactionCode") == "P")
    sells = sum(1 for t in transactions if (t.get("change") or 0) < 0 and t.get("transactionCode") == "S")
    return {
        "present": summary["count"] > 0,
        "net_value_usd": summary["net_value_usd"],
        "buy_count": buys,
        "sell_count": sells,
        "transactions_count": summary["count"],
    }


@router.get("/signals")
async def signals_batch(
    tickers: str = Query(..., description="Liste de tickers séparés par virgule (ex: VRT,IREN,EOSE)"),
    max_fund_positions: int = Query(default=60, ge=5, le=500),
):
    """
    Enrichissement batch d'une liste de tickers avec 4 angles de validation :
      1. ETF thématiques : présence dans AIQ/BOTZ/CHAT/SOXX/URNM/...
      2. Smart money 13-F : fonds high-conviction qui détiennent (avec status initiated/increased)
      3. Insider top management : net achats / ventes (90j via Finnhub)
      4. Trades politiques : Pelosi & Co (STUB pour l'instant, source à brancher)

    PRINCIPE : ces signaux annotent, ils ne filtrent JAMAIS. Une opportunité
    sans aucun signal coché reste une opportunité valide — c'est juste qu'on
    n'a pas d'information complémentaire dessus.

    Format : { ticker: { etf, smart_money, insider, political } }
    """
    ticker_list = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    # Pré-charge l'index ETF une fois (au lieu d'itérer 75 candidats × N tickers)
    etf_index = {c["symbol"]: c for c in etf_holdings.get_unique_candidates()}

    out: dict[str, dict] = {}
    for sym in ticker_list:
        out[sym] = {
            "etf": _build_etf_signal(sym, etf_index),
            "smart_money": _build_smart_money_signal(sym, max_fund_positions=max_fund_positions),
            "insider": _build_insider_signal(sym),
            "political": political_trades.get_political_trades_for_ticker(sym),
        }
    return out
