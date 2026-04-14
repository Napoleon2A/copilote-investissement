"""
Scanner de marché — Détection proactive d'opportunités

Philosophie :
  On ne cherche pas à tout montrer — on cherche à signaler le bon ticker au bon moment.
  Un signal pertinent = un titre dont la situation actuelle justifie de l'examiner maintenant.

Trois types de signaux détectés :
  1. QUALITÉ DÉCOTÉE   — entreprise solide mais titre maltraité (oversold + fondamentaux ok)
  2. MOMENTUM CONFIRMÉ — tendance + fondamentaux alignés = conviction plus forte
  3. CATALYSEUR NEWS   — actualité récente détectée qui peut changer la thèse

L'univers est délibérément resserré et diversifié (pas 500 titres — ~60 ciblés).
"""
import logging
from typing import Optional
from datetime import datetime, timedelta
from app.services.data_service import (
    get_price_changes, get_fundamentals, get_news, get_company_info,
    get_earnings_calendar,
)
from app.services.scoring import compute_all_scores, get_score_label

logger = logging.getLogger(__name__)

# ── Seuils ───────────────────────────────────────────────────────────────────
OPPORTUNITY_MIN_SCORE = 6.0      # Score composite minimum pour apparaître
QUALITY_DECOTE_HIGH_52W = -30    # % sous le 52W high pour signal "décote qualité"
OVERSOLD_THRESHOLD = -40         # % sous le 52W high pour signal "oversold majeur"

# ── Univers d'actions à scanner ───────────────────────────────────────────────
# Sélection qualitative — chaque ticker a une raison d'être dans la liste.
# On préfère la pertinence sectorielle à l'exhaustivité.
SCAN_UNIVERSE: dict[str, list[str]] = {
    # Tech US — incontournables + challengers
    "Tech US": [
        "MSFT", "AAPL", "GOOGL", "META", "NVDA",
        "AMD", "CRM", "ADBE", "NOW", "PANW",
    ],
    # Semi-conducteurs — cycle très lisible
    "Semi-conducteurs": [
        "ASML", "TSM", "AMAT", "LRCX", "KLAC",
        "MU", "INTC", "STM",
    ],
    # Finance US — sensible aux taux
    "Finance US": [
        "JPM", "GS", "BRK-B", "V", "MA",
        "AXP", "SPGI",
    ],
    # Santé — défensif + innovation
    "Santé US": [
        "LLY", "UNH", "ABBV", "MRK", "ISRG",
        "DXCM", "VEEV",
    ],
    # Énergie traditionnelle + transition
    "Énergie": [
        "XOM", "CVX", "COP", "NEE",
        "FSLR", "ENPH", "ARRY",
    ],
    # Consommation / E-commerce
    "Consommation US": [
        "AMZN", "TSLA", "NKE", "COST", "HD",
    ],
    # Industriels / Défense — contexte géopolotique
    "Industriels & Défense": [
        "RTX", "LMT", "NOC", "GE", "CAT", "DE",
    ],
    # Europe — grandes capitalisations liquides
    # Note : ASML est aussi dans Semi-conducteurs — on évite le doublon ici
    "Europe Large Caps": [
        "MC.PA", "AIR.PA", "OR.PA", "TTE.PA",
        "SAP", "NOVO-B.CO",
    ],
    # Small/Mid caps croissance — plus spéculatif, potentiel élevé
    "Growth / Spéculatif": [
        "RKLB", "JOBY", "PLTR", "HOOD", "SOFI",
        "IONQ", "RGTI",
    ],
    # Matières premières — hedge inflation / cycle
    "Matières premières": [
        "FCX", "NEM", "AA", "VALE",
    ],
}

# ── Mots-clés news par catégorie ──────────────────────────────────────────────
# Utilisés pour catégoriser l'impact potentiel d'une news.
NEWS_BULLISH_KEYWORDS = [
    "beat", "beats", "record", "upgrade", "buyback", "dividend", "raised guidance",
    "strong earnings", "outperform", "buy", "acquisition", "partnership", "contract",
    "fda approval", "approved", "positive", "growth", "breakout", "target raised",
    "beat estimates", "strong revenue", "accelerating",
]
NEWS_BEARISH_KEYWORDS = [
    "miss", "misses", "downgrade", "cut", "below expectations", "guidance cut",
    "sell", "layoffs", "restructuring", "recall", "lawsuit", "fraud", "investigation",
    "loss", "decline", "underperform", "warning", "risk", "regulatory", "fine",
    "breach", "hack", "bankruptcy", "default",
]
NEWS_MACRO_KEYWORDS = [
    "fed", "rate", "inflation", "recession", "gdp", "unemployment", "tariff",
    "trade war", "geopolitical", "war", "conflict", "sanctions", "election",
    "interest rate", "central bank", "ecb", "boe",
]


def _classify_news(news_items: list[dict]) -> dict:
    """
    Analyse les news récentes d'un ticker et retourne :
      - sentiment : "bullish" | "bearish" | "mixed" | "neutral"
      - key_headlines : 2 titres les plus pertinents
      - has_catalyst : True si un événement significatif est détecté
    """
    if not news_items:
        return {"sentiment": "neutral", "key_headlines": [], "has_catalyst": False}

    bullish_count = 0
    bearish_count = 0
    key_headlines = []

    for item in news_items[:5]:  # Regarder les 5 dernières news
        title = (item.get("title") or "").lower()

        is_bullish = any(kw in title for kw in NEWS_BULLISH_KEYWORDS)
        is_bearish = any(kw in title for kw in NEWS_BEARISH_KEYWORDS)

        if is_bullish:
            bullish_count += 1
        if is_bearish:
            bearish_count += 1

        # Conserver les titres avec un signal fort
        if is_bullish or is_bearish:
            original_title = item.get("title", "")
            if original_title and original_title not in key_headlines:
                key_headlines.append(original_title)

    # Déterminer le sentiment global
    if bullish_count > bearish_count and bullish_count >= 2:
        sentiment = "bullish"
    elif bearish_count > bullish_count and bearish_count >= 2:
        sentiment = "bearish"
    elif bullish_count > 0 or bearish_count > 0:
        sentiment = "mixed"
    else:
        sentiment = "neutral"

    has_catalyst = len(key_headlines) > 0

    return {
        "sentiment": sentiment,
        "key_headlines": key_headlines[:2],
        "has_catalyst": has_catalyst,
        "bullish_signals": bullish_count,
        "bearish_signals": bearish_count,
    }


def _detect_signal_type(scores: dict, changes: dict, news_analysis: dict) -> str:
    """
    Détermine le type de signal principal pour un ticker.

    Types :
      "quality_dip"      — titre de qualité en baisse injustifiée
      "momentum_quality" — qualité + momentum alignés
      "news_catalyst"    — actualité potentiellement impactante
      "valuation"        — valorisation attractive seule
    """
    composite = scores["composite"]
    qual = scores["quality"]["score"]
    mom = scores["momentum"]["score"]
    val = scores["valuation"]["score"]
    pct_from_high = changes.get("pct_from_52w_high")

    # Signal 1 : qualité décotée (titre solide mais maltraité)
    if qual >= 6.5 and pct_from_high is not None and pct_from_high <= QUALITY_DECOTE_HIGH_52W:
        return "quality_dip"

    # Signal 2 : actualité catalyseur
    if news_analysis.get("has_catalyst") and news_analysis.get("sentiment") in ("bullish", "mixed"):
        return "news_catalyst"

    # Signal 3 : momentum + qualité alignés
    if mom >= 6.5 and qual >= 6:
        return "momentum_quality"

    # Signal 4 : valorisation attractive
    if val >= 7:
        return "valuation"

    return "composite"


def _build_highlights(scores: dict, changes: dict, news_analysis: dict, signal_type: str) -> list[str]:
    """
    Construit les points forts à afficher pour un ticker.
    Max 3 points, triés par pertinence par rapport au signal type.
    """
    highlights = []

    pct_from_high = changes.get("pct_from_52w_high")
    change_1m = changes.get("change_1m")
    change_3m = changes.get("change_3m")

    # Selon le type de signal, on commence par les points les plus pertinents
    if signal_type == "quality_dip":
        if pct_from_high is not None:
            highlights.append(
                f"Titre {abs(pct_from_high):.0f}% sous son plus haut 52W — décote potentielle"
            )
        qual_reasons = scores["quality"].get("reasons", [])
        if qual_reasons:
            highlights.append(qual_reasons[0])

    elif signal_type == "news_catalyst":
        headlines = news_analysis.get("key_headlines", [])
        if headlines:
            # Tronquer si trop long
            headline = headlines[0][:80] + ("…" if len(headlines[0]) > 80 else "")
            highlights.append(f"Actualité : {headline}")

    elif signal_type == "momentum_quality":
        if change_1m is not None and change_1m > 0:
            highlights.append(f"Momentum 1M : +{change_1m:.1f}%")
        elif change_3m is not None and change_3m > 0:
            highlights.append(f"Momentum 3M : +{change_3m:.1f}%")

    # Compléter avec les meilleures raisons de chaque score
    score_keys = [
        ("quality", scores["quality"]),
        ("valuation", scores["valuation"]),
        ("growth", scores["growth"]),
        ("momentum", scores["momentum"]),
    ]
    # Trier par score décroissant
    score_keys.sort(key=lambda x: x[1]["score"], reverse=True)

    for key, detail in score_keys:
        if len(highlights) >= 3:
            break
        if detail["score"] >= 6.5:
            reasons = [
                r for r in detail.get("reasons", [])
                if "insuffisant" not in r.lower()
                and r not in highlights
            ]
            if reasons:
                highlights.append(reasons[0])

    return highlights[:3]


def scan_ticker(ticker: str) -> Optional[dict]:
    """
    Analyse complète d'un ticker.
    Retourne un dict d'opportunité si score suffisant + signal identifiable.
    Retourne None sinon.
    """
    try:
        changes = get_price_changes(ticker)
        if not changes:
            return None

        fundamentals = get_fundamentals(ticker)
        if not fundamentals:
            return None

        scores = compute_all_scores(fundamentals, changes)
        composite = scores["composite"]

        if composite < OPPORTUNITY_MIN_SCORE:
            return None

        # Analyse des news récentes
        news_items = get_news(ticker, count=5)
        news_analysis = _classify_news(news_items)

        # Déterminer le type de signal
        signal_type = _detect_signal_type(scores, changes, news_analysis)

        # Construire les points forts
        highlights = _build_highlights(scores, changes, news_analysis, signal_type)

        if not highlights:
            return None  # Rien de notable à dire malgré le bon score

        # Action suggérée
        # buy_small = composite fort + qualité élevée + pas de news bearish active
        # Seuil 7.5 car les valeurs de qualité ont souvent une valorisation tendue
        # qui plafonne le composite même quand les fondamentaux sont excellents.
        quality_score = scores["quality"]["score"]
        news_bearish = news_analysis.get("sentiment") == "bearish"
        if composite >= 7.5 and quality_score >= 6.5 and not news_bearish:
            action, action_label = "buy_small", "Initier position"
        elif composite >= 7.0:
            action, action_label = "read", "Approfondir"
        elif composite >= 6.5:
            action, action_label = "watch", "Surveiller"
        else:
            action, action_label = "watch", "À surveiller"

        # Upside analystes
        target = fundamentals.get("target_price")
        current_price = changes.get("current_price")
        upside = None
        if target and current_price and current_price > 0:
            upside = round((target - current_price) / current_price * 100, 1)

        # Récupérer le nom de la société
        info = get_company_info(ticker)
        name = info.get("longName") or info.get("shortName") or ticker

        # Calendrier des earnings — alerte si résultats dans < 14 jours
        earnings_alert = None
        try:
            cal = get_earnings_calendar(ticker)
            earnings_str = cal.get("earnings_date")
            if earnings_str and earnings_str != "None":
                from datetime import date as _date
                earnings_dt = _date.fromisoformat(str(earnings_str)[:10])
                days_until = (earnings_dt - datetime.utcnow().date()).days
                if 0 <= days_until <= 14:
                    earnings_alert = f"Résultats dans {days_until}j ({earnings_dt.strftime('%d/%m')})"
        except Exception:
            pass

        if earnings_alert and earnings_alert not in highlights:
            highlights.insert(0, f"⚠ {earnings_alert}")

        # Alerte si news bearish malgré bon score — risque de détérioration
        if news_analysis.get("sentiment") == "bearish" and news_analysis.get("key_headlines"):
            bearish_note = f"⚠ News négative : {news_analysis['key_headlines'][0][:70]}…"
            # On l'ajoute seulement si pas déjà capturé via le signal type
            if signal_type != "news_catalyst":
                highlights.append(bearish_note)

        return {
            "ticker": ticker,
            "name": name,
            "type": "opportunity",
            "signal_type": signal_type,
            "current_price": current_price,
            "change_1d": changes.get("change_1d"),
            "change_1m": changes.get("change_1m"),
            "change_3m": changes.get("change_3m"),
            "change_ytd": changes.get("change_ytd"),
            "pct_from_52w_high": changes.get("pct_from_52w_high"),
            "scores": {
                "composite": composite,
                "composite_label": get_score_label(composite),
                "quality": scores["quality"]["score"],
                "valuation": scores["valuation"]["score"],
                "growth": scores["growth"]["score"],
                "momentum": scores["momentum"]["score"],
                "risk": scores["risk"]["score"],
            },
            "highlights": highlights,
            "action": action,
            "action_label": action_label,
            "news_sentiment": news_analysis["sentiment"],
            "has_catalyst": news_analysis["has_catalyst"],
            "key_headlines": news_analysis.get("key_headlines", []),
            "upside_vs_target": upside,
            "analyst_count": fundamentals.get("analyst_count"),
            "market_cap": fundamentals.get("market_cap"),
            "scanned_at": datetime.utcnow().isoformat(),
        }

    except Exception as e:
        logger.warning(f"Scanner: erreur sur {ticker}: {e}")
        return None


def run_scan(
    exclude_tickers: list[str] | None = None,
    max_results: int = 5,
    sectors: list[str] | None = None,
    signal_types: list[str] | None = None,
) -> list[dict]:
    """
    Scanne l'univers et retourne les meilleures opportunités.

    Diversification : on impose au plus 2 résultats par secteur
    pour éviter de retourner "NVDA AAPL MSFT AMD" en boucle.

    Tri final : score composite + bonus si catalyseur news actif.
    """
    excluded = set(t.upper() for t in (exclude_tickers or []))

    # Sélectionner les secteurs
    universe_to_scan = {
        s: t for s, t in SCAN_UNIVERSE.items()
        if sectors is None or s in sectors
    }

    opportunities = []
    sector_counts: dict[str, int] = {}
    MAX_PER_SECTOR = 2

    for sector, tickers in universe_to_scan.items():
        for ticker in tickers:
            if ticker.upper() in excluded:
                continue
            if sector_counts.get(sector, 0) >= MAX_PER_SECTOR:
                continue

            result = scan_ticker(ticker)
            if result:
                if signal_types and result["signal_type"] not in signal_types:
                    continue
                result["sector_group"] = sector
                opportunities.append(result)
                sector_counts[sector] = sector_counts.get(sector, 0) + 1

    logger.info(
        f"Scanner: {sum(len(v) for v in universe_to_scan.values())} tickers analysés, "
        f"{len(opportunities)} opportunités trouvées"
    )

    # Score ajusté : bonus +0.3 si catalyseur news bullish
    def adjusted_score(opp: dict) -> float:
        base = opp["scores"]["composite"]
        if opp.get("has_catalyst") and opp.get("news_sentiment") == "bullish":
            return base + 0.3
        return base

    opportunities.sort(key=adjusted_score, reverse=True)
    return opportunities[:max_results]


def run_macro_scan() -> dict:
    """
    Analyse macro rapide :
      - Performance des secteurs clés (ETF proxies)
      - Signal de risk-on / risk-off basé sur VIX + SP500
      - Détection des secteurs en divergence (secteur fort vs marché faible)

    Utilise des tickers proxy pour les secteurs (ETFs Invesco/SPDR).
    """
    from app.services.data_service import get_price_changes as gpc

    sector_etfs = {
        "Tech (QQQ)": "QQQ",
        "Énergie (XLE)": "XLE",
        "Santé (XLV)": "XLV",
        "Finance (XLF)": "XLF",
        "Industriels (XLI)": "XLI",
        "Défense (ITA)": "ITA",
        "Immobilier (VNQ)": "VNQ",
        "Matières premières (GDX)": "GDX",
        "Semi-conducteurs (SOXX)": "SOXX",
    }

    market_indices = {
        "SP500": "^GSPC",
        "VIX": "^VIX",
        "Or": "GC=F",
        "USD Index": "DX-Y.NYB",
    }

    sector_data = {}
    for name, ticker in sector_etfs.items():
        try:
            changes = gpc(ticker)
            if changes:
                sector_data[name] = {
                    "ticker": ticker,
                    "change_1d": changes.get("change_1d"),
                    "change_1m": changes.get("change_1m"),
                    "change_ytd": changes.get("change_ytd"),
                    "pct_from_52w_high": changes.get("pct_from_52w_high"),
                }
        except Exception:
            pass

    macro_data = {}
    for name, ticker in market_indices.items():
        try:
            changes = gpc(ticker)
            if changes:
                macro_data[name] = {
                    "price": changes.get("current_price"),
                    "change_1d": changes.get("change_1d"),
                    "change_ytd": changes.get("change_ytd"),
                }
        except Exception:
            pass

    # Identifier les secteurs en sur/sous-performance vs SP500
    sp500_1m = (macro_data.get("SP500") or {}).get("change_ytd")
    outperformers = []
    underperformers = []

    if sp500_1m is not None:
        for name, data in sector_data.items():
            sector_ytd = data.get("change_ytd")
            if sector_ytd is not None:
                diff = sector_ytd - sp500_1m
                if diff > 5:
                    outperformers.append({"sector": name, "outperformance": round(diff, 1)})
                elif diff < -5:
                    underperformers.append({"sector": name, "underperformance": round(diff, 1)})

    # Signal risk-on / risk-off
    vix = (macro_data.get("VIX") or {}).get("price")
    risk_regime = "neutral"
    if vix:
        if vix > 30:
            risk_regime = "risk-off"   # Peur élevée — chercher défensifs et cash
        elif vix < 15:
            risk_regime = "risk-on"    # Complaisance — surveiller les retournements
        elif vix < 20:
            risk_regime = "calme"      # Condition normale favorable
        else:
            risk_regime = "vigilance"  # Volatilité élevée mais pas de panique

    return {
        "macro": macro_data,
        "sectors": sector_data,
        "outperformers": sorted(outperformers, key=lambda x: x["outperformance"], reverse=True),
        "underperformers": sorted(underperformers, key=lambda x: x["underperformance"]),
        "risk_regime": risk_regime,
        "vix": vix,
        "scanned_at": datetime.utcnow().isoformat(),
    }
