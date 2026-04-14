"""
Scanner de marché — détection proactive d'opportunités

Ce module analyse automatiquement un univers d'actions diversifiées (US + Europe)
et remonte les meilleures opportunités selon les scores du système.

Philosophie :
  - On ne cherche pas à battre le marché par prédiction — on identifie des situations
    où les fondamentaux ET le momentum pointent dans la même direction.
  - Un "signal" n'est pas une recommandation. C'est un point de départ pour creuser.
  - La liste de tickers est volontairement diversifiée : secteurs, géographies, tailles.

Critères pour qu'un ticker soit remonté comme "opportunité" :
  - Score composite >= OPPORTUNITY_MIN_SCORE
  - Au moins un signal fort (momentum, valorisation ou qualité notable)
  - Pas déjà dans le portefeuille de l'utilisateur (éviter les doublons)
"""
import logging
from typing import Optional
from app.services.data_service import get_price_changes, get_fundamentals
from app.services.scoring import compute_all_scores, get_score_label

logger = logging.getLogger(__name__)

# ── Seuil minimum pour être considéré comme opportunité ──────────────────────
OPPORTUNITY_MIN_SCORE = 6.0

# ── Univers d'actions à scanner ───────────────────────────────────────────────
# Diversifié par secteur, géographie et taille.
# Mis à jour manuellement — ajouter/retirer selon la pertinence.
SCAN_UNIVERSE: dict[str, list[str]] = {
    "Tech US": [
        "AAPL", "MSFT", "GOOGL", "META", "NVDA",
        "AMD", "INTC", "CRM", "ADBE", "NOW",
    ],
    "Tech / Semi Europe": [
        "ASML", "SAP", "STM", "SOITEC.PA",
    ],
    "Finance US": [
        "JPM", "BAC", "GS", "V", "MA",
        "BRK-B", "AXP",
    ],
    "Santé US": [
        "JNJ", "LLY", "UNH", "PFE", "ABBV",
        "MRK", "BMY",
    ],
    "Énergie US": [
        "XOM", "CVX", "COP", "SLB",
        "NEE", "ENPH", "FSLR",
    ],
    "Consommation US": [
        "AMZN", "TSLA", "NKE", "MCD", "SBUX",
        "HD", "LOW", "TGT",
    ],
    "Industriels US": [
        "CAT", "DE", "HON", "RTX", "GE",
        "BA", "UPS",
    ],
    "Matières premières": [
        "FCX", "NEM", "AA", "CLF",
    ],
    "Small / Mid caps spéculatifs": [
        "PLUG", "BLNK", "CHPT", "JOBY", "RKLB",
        "ARRY", "STEM",
    ],
    "Europe large caps": [
        "MC.PA", "TTE.PA", "SAN.PA", "AIR.PA",
        "LVMH.PA", "OR.PA",
    ],
}


def scan_ticker(ticker: str) -> Optional[dict]:
    """
    Analyse un ticker et retourne un dict d'opportunité s'il passe les critères.
    Retourne None si le ticker ne mérite pas d'être remonté.
    """
    try:
        changes = get_price_changes(ticker)
        if not changes:
            return None

        fundamentals = get_fundamentals(ticker)
        scores = compute_all_scores(fundamentals, changes)
        composite = scores["composite"]

        if composite < OPPORTUNITY_MIN_SCORE:
            return None

        # Identifier les points forts principaux
        highlights = []

        val_score = scores["valuation"]["score"]
        qual_score = scores["quality"]["score"]
        mom_score = scores["momentum"]["score"]
        risk_score = scores["risk"]["score"]
        growth_score = scores["growth"]["score"]

        if val_score >= 7:
            reasons = scores["valuation"].get("reasons", [])
            highlights.append(reasons[0] if reasons else f"Valorisation attractive ({val_score}/10)")

        if qual_score >= 7:
            reasons = scores["quality"].get("reasons", [])
            highlights.append(reasons[0] if reasons else f"Qualité élevée ({qual_score}/10)")

        if mom_score >= 7:
            reasons = scores["momentum"].get("reasons", [])
            highlights.append(reasons[0] if reasons else f"Momentum fort ({mom_score}/10)")

        if growth_score >= 7:
            reasons = scores["growth"].get("reasons", [])
            highlights.append(reasons[0] if reasons else f"Croissance forte ({growth_score}/10)")

        # Déduplication
        highlights = list(dict.fromkeys(highlights))[:3]

        if not highlights:
            return None  # Score ok mais rien de notable à dire

        # Déterminer l'action suggérée
        if composite >= 7.5:
            action = "read"
            action_label = "Approfondir"
        elif composite >= 6.5:
            action = "watch"
            action_label = "Surveiller"
        else:
            action = "watch"
            action_label = "Surveiller"

        # Calculer le upside analystes si disponible
        target = fundamentals.get("target_price")
        current_price = changes.get("current_price")
        upside = None
        if target and current_price and current_price > 0:
            upside = round((target - current_price) / current_price * 100, 1)

        return {
            "ticker": ticker,
            "type": "opportunity",
            "current_price": current_price,
            "change_1d": changes.get("change_1d"),
            "change_1m": changes.get("change_1m"),
            "change_ytd": changes.get("change_ytd"),
            "scores": {
                "composite": composite,
                "composite_label": get_score_label(composite),
                "quality": qual_score,
                "valuation": val_score,
                "growth": growth_score,
                "momentum": mom_score,
                "risk": risk_score,
            },
            "highlights": highlights,
            "action": action,
            "action_label": action_label,
            "upside_vs_target": upside,
            "analyst_count": fundamentals.get("analyst_count"),
        }

    except Exception as e:
        logger.warning(f"Scanner: erreur sur {ticker}: {e}")
        return None


def run_scan(
    exclude_tickers: list[str] | None = None,
    max_results: int = 5,
    sectors: list[str] | None = None,
) -> list[dict]:
    """
    Scanne l'univers d'actions et retourne les meilleures opportunités.

    exclude_tickers : tickers déjà en portefeuille (éviter doublons)
    max_results     : nombre maximum d'opportunités à retourner
    sectors         : filtrer par secteurs (None = tous)

    Les résultats sont triés par score composite décroissant.
    """
    excluded = set(t.upper() for t in (exclude_tickers or []))
    opportunities = []

    # Sélectionner les secteurs à scanner
    universe_to_scan = {
        sector: tickers
        for sector, tickers in SCAN_UNIVERSE.items()
        if sectors is None or sector in sectors
    }

    scanned = 0
    for sector, tickers in universe_to_scan.items():
        for ticker in tickers:
            if ticker.upper() in excluded:
                continue

            result = scan_ticker(ticker)
            scanned += 1

            if result:
                result["sector_group"] = sector
                opportunities.append(result)

    logger.info(f"Scanner: {scanned} tickers analysés, {len(opportunities)} opportunités trouvées")

    # Trier par score composite décroissant
    opportunities.sort(key=lambda x: x["scores"]["composite"], reverse=True)

    return opportunities[:max_results]
