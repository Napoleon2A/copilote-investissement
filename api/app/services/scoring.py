"""
Moteur de scoring — V1

Philosophie : scores explicables, basés sur des heuristiques documentées,
pas sur du ML opaque.

Chaque score est décomposé en critères. Chaque critère est justifié.
Les pondérations sont modifiables dans SCORE_WEIGHTS.

Scores produits :
  - quality   : qualité de l'entreprise (marges, ROE, stabilité)
  - valuation : attractivité du prix actuel
  - growth    : dynamique de croissance
  - momentum  : comportement récent du titre
  - risk      : niveau de risque perçu (dette, volatilité)
  - composite : score global pondéré

Chaque score est un float entre 0 et 10.
"""
from typing import Optional
import logging

logger = logging.getLogger(__name__)

# Pondérations du score composite — modifiables sans changer le code
SCORE_WEIGHTS = {
    "quality": 0.30,
    "valuation": 0.25,
    "growth": 0.20,
    "momentum": 0.15,
    "risk": 0.10,   # Note : risk est inversé (score élevé = risque faible)
}


def _clamp(value: float, min_val: float = 0, max_val: float = 10) -> float:
    """Borne un score entre min et max."""
    return max(min_val, min(max_val, value))


def score_quality(fundamentals: dict) -> dict:
    """
    Score qualité — basé sur la rentabilité et la solidité structurelle.

    Critères :
      - Marge opérationnelle (operating_margin)
      - ROE (return on equity)
      - Marge nette (net_margin)
      - Ratio dette/equity (debt_to_equity) — inversé

    Hypothèse : une entreprise de qualité a des marges élevées, un ROE élevé,
    et une dette maîtrisée.
    """
    score = 5.0  # Point de départ neutre
    reasons = []

    op_margin = fundamentals.get("operating_margin")
    if op_margin is not None:
        if op_margin > 0.30:
            score += 2.0
            reasons.append(f"Marge opé. excellente : {op_margin:.1%}")
        elif op_margin > 0.15:
            score += 1.0
            reasons.append(f"Marge opé. bonne : {op_margin:.1%}")
        elif op_margin > 0.05:
            reasons.append(f"Marge opé. correcte : {op_margin:.1%}")
        elif op_margin < 0:
            score -= 2.0
            reasons.append(f"Marge opé. négative : {op_margin:.1%}")
        else:
            score -= 0.5
            reasons.append(f"Marge opé. faible : {op_margin:.1%}")

    roe = fundamentals.get("roe")
    if roe is not None:
        if roe > 0.25:
            score += 1.5
            reasons.append(f"ROE élevé : {roe:.1%}")
        elif roe > 0.15:
            score += 0.5
            reasons.append(f"ROE correct : {roe:.1%}")
        elif roe < 0:
            score -= 1.5
            reasons.append(f"ROE négatif : {roe:.1%}")

    net_margin = fundamentals.get("net_margin")
    if net_margin is not None:
        if net_margin > 0.20:
            score += 1.0
            reasons.append(f"Marge nette forte : {net_margin:.1%}")
        elif net_margin < 0:
            score -= 1.0
            reasons.append(f"Marge nette négative : {net_margin:.1%}")

    de_ratio = fundamentals.get("debt_to_equity")
    if de_ratio is not None:
        if de_ratio < 50:
            score += 0.5
            reasons.append(f"Dette faible : D/E = {de_ratio:.0f}%")
        elif de_ratio > 200:
            score -= 1.0
            reasons.append(f"Endettement élevé : D/E = {de_ratio:.0f}%")

    # Free cash flow — indicateur clé de la solidité réelle de l'entreprise.
    # Une entreprise peut afficher des bénéfices comptables sans générer de cash.
    # FCF positif = capacité à investir, racheter des actions ou rembourser la dette.
    fcf = fundamentals.get("free_cashflow")
    market_cap = fundamentals.get("market_cap")
    if fcf is not None and market_cap and market_cap > 0:
        fcf_yield = fcf / market_cap  # FCF Yield = FCF / Market Cap
        if fcf_yield > 0.05:           # > 5% = très généreux en cash
            score += 1.5
            reasons.append(f"FCF yield élevé : {fcf_yield:.1%} — forte génération de cash")
        elif fcf_yield > 0.015:        # > 1.5% = correct (les large caps investissent massivement)
            score += 0.5
            reasons.append(f"FCF positif : {fcf_yield:.1%} de rendement ({fcf/1e9:.0f}B)")
        elif fcf_yield < -0.02:        # FCF négatif = brûle du cash
            score -= 1.0
            reasons.append(f"FCF négatif : entreprise en mode cash-burn")
    elif fcf is not None:
        if fcf > 0:
            score += 0.5
            reasons.append("FCF positif — génère du cash")
        elif fcf < 0:
            score -= 0.5
            reasons.append("FCF négatif — consomme du cash")

    if not reasons:
        reasons.append("Données insuffisantes pour évaluer la qualité")

    return {"score": round(_clamp(score), 1), "reasons": reasons}


def score_valuation(fundamentals: dict, price_changes: Optional[dict] = None) -> dict:
    """
    Score valorisation — attractivité du prix actuel.

    Critères :
      - P/E trailing (trailingPE)
      - EV/EBITDA
      - PEG ratio
      - Prix vs cible analystes (nécessite le prix courant depuis price_changes)

    Attention : la valorisation est contextuelle (secteur, cycle de taux).
    Ce score est une heuristique approximative, pas une vérité.
    """
    score = 5.0
    reasons = []

    pe = fundamentals.get("pe_ratio")
    if pe is not None and pe > 0:
        if pe < 12:
            score += 2.0
            reasons.append(f"P/E très bas : {pe:.1f}x")
        elif pe < 18:
            score += 1.0
            reasons.append(f"P/E raisonnable : {pe:.1f}x")
        elif pe < 25:
            reasons.append(f"P/E modéré : {pe:.1f}x")
        elif pe < 40:
            score -= 1.0
            reasons.append(f"P/E élevé : {pe:.1f}x")
        else:
            score -= 2.0
            reasons.append(f"P/E très élevé : {pe:.1f}x — prime de croissance requise")
    elif pe is not None and pe < 0:
        score -= 1.5
        reasons.append("P/E négatif (pertes)")

    ev_ebitda = fundamentals.get("ev_to_ebitda")
    if ev_ebitda is not None and ev_ebitda > 0:
        if ev_ebitda < 8:
            score += 1.5
            reasons.append(f"EV/EBITDA attractif : {ev_ebitda:.1f}x")
        elif ev_ebitda < 15:
            score += 0.5
            reasons.append(f"EV/EBITDA correct : {ev_ebitda:.1f}x")
        elif ev_ebitda > 25:
            score -= 1.0
            reasons.append(f"EV/EBITDA tendu : {ev_ebitda:.1f}x")

    peg = fundamentals.get("peg_ratio")
    if peg is not None and 0 < peg < 5:
        if peg < 1:
            score += 1.5
            reasons.append(f"PEG < 1 : valorisation attractive vs croissance ({peg:.2f})")
        elif peg < 2:
            score += 0.5
            reasons.append(f"PEG raisonnable : {peg:.2f}")
        else:
            score -= 0.5
            reasons.append(f"PEG élevé : {peg:.2f}")

    # Distance vs cible analystes — utilise le prix depuis price_changes
    target = fundamentals.get("target_price")
    current_price = (price_changes or {}).get("current_price")
    analyst_count = fundamentals.get("analyst_count")
    if target and current_price and current_price > 0 and analyst_count:
        upside = (target - current_price) / current_price
        if upside > 0.20:
            score += 1.0
            reasons.append(f"Upside analystes : +{upside:.0%} vs cible ({analyst_count} analystes)")
        elif upside < -0.10:
            score -= 0.5
            reasons.append(f"Downside analystes : {upside:.0%} vs cible ({analyst_count} analystes)")

    if not reasons:
        reasons.append("Données de valorisation insuffisantes")

    return {"score": round(_clamp(score), 1), "reasons": reasons}


def score_growth(fundamentals: dict) -> dict:
    """
    Score croissance — dynamique des revenus et résultats.

    Critères :
      - Croissance du chiffre d'affaires (revenue_growth)
      - Croissance des bénéfices (earnings_growth)
      - Croissance trimestrielle des bénéfices

    Note : yfinance donne des données trailing (12 mois glissants).
    """
    score = 5.0
    reasons = []

    rev_growth = fundamentals.get("revenue_growth")
    if rev_growth is not None:
        if rev_growth > 0.30:
            score += 2.5
            reasons.append(f"Croissance CA très forte : +{rev_growth:.1%}")
        elif rev_growth > 0.15:
            score += 1.5
            reasons.append(f"Croissance CA solide : +{rev_growth:.1%}")
        elif rev_growth > 0.05:
            score += 0.5
            reasons.append(f"Croissance CA modeste : +{rev_growth:.1%}")
        elif rev_growth < 0:
            score -= 1.5
            reasons.append(f"Recul du CA : {rev_growth:.1%}")

    earn_growth = fundamentals.get("earnings_growth")
    if earn_growth is not None:
        if earn_growth > 0.25:
            score += 2.0
            reasons.append(f"Croissance résultats forte : +{earn_growth:.1%}")
        elif earn_growth > 0.10:
            score += 1.0
            reasons.append(f"Croissance résultats correcte : +{earn_growth:.1%}")
        elif earn_growth < -0.10:
            score -= 1.5
            reasons.append(f"Recul résultats : {earn_growth:.1%}")

    if not reasons:
        reasons.append("Données de croissance insuffisantes")

    return {"score": round(_clamp(score), 1), "reasons": reasons}


def score_momentum(price_changes: dict) -> dict:
    """
    Score momentum — comportement récent du titre.

    Critères :
      - Performance 1 mois
      - Performance 3 mois
      - Distance depuis le plus bas 52W (indicateur de rebond potentiel)
      - Distance depuis le plus haut 52W (indicateur de solidité)

    Philosophie : le momentum confirme ou infirme la thèse fondamentale.
    Un titre en fort recul peut être une opportunité OU un signal d'alerte.
    """
    score = 5.0
    reasons = []

    change_1m = price_changes.get("change_1m")
    if change_1m is not None:
        if change_1m > 15:
            score += 1.5
            reasons.append(f"Forte hausse sur 1 mois : +{change_1m:.1f}%")
        elif change_1m > 5:
            score += 0.5
            reasons.append(f"Bonne performance 1 mois : +{change_1m:.1f}%")
        elif change_1m < -15:
            score -= 1.5
            reasons.append(f"Forte baisse sur 1 mois : {change_1m:.1f}%")
        elif change_1m < -5:
            score -= 0.5
            reasons.append(f"Recul 1 mois : {change_1m:.1f}%")

    change_3m = price_changes.get("change_3m")
    if change_3m is not None:
        if change_3m > 20:
            score += 1.5
            reasons.append(f"Excellent momentum 3 mois : +{change_3m:.1f}%")
        elif change_3m > 5:
            score += 0.5
            reasons.append(f"Momentum positif 3 mois : +{change_3m:.1f}%")
        elif change_3m < -20:
            score -= 1.5
            reasons.append(f"Chute 3 mois : {change_3m:.1f}%")

    pct_from_low = price_changes.get("pct_from_52w_low")
    pct_from_high = price_changes.get("pct_from_52w_high")
    if pct_from_low is not None and pct_from_high is not None:
        if pct_from_high < -30:
            score -= 1.0
            reasons.append(f"Titre {abs(pct_from_high):.0f}% sous son plus haut 52W")
        elif pct_from_high > -10:
            score += 0.5
            reasons.append("Titre proche de son plus haut 52W")

        if pct_from_low < 15:
            reasons.append(f"Proche du plus bas 52W (+{pct_from_low:.0f}%)")

    if not reasons:
        reasons.append("Données de momentum insuffisantes")

    return {"score": round(_clamp(score), 1), "reasons": reasons}


def score_risk(fundamentals: dict, price_changes: dict) -> dict:
    """
    Score risque — inversé : score élevé = risque FAIBLE.

    Critères :
      - Ratio dette/equity
      - Current ratio (liquidité)
      - Volatilité implicite du titre (via amplitude 52W)
      - Bénéfices positifs

    Note : ce score mesure le risque de détérioration bilancielle et la
    stabilité opérationnelle. Il ne mesure pas le risque de valorisation.
    """
    score = 5.0  # Score élevé = risque faible
    reasons = []

    de_ratio = fundamentals.get("debt_to_equity")
    if de_ratio is not None:
        if de_ratio < 30:
            score += 2.0
            reasons.append(f"Dette très faible (D/E={de_ratio:.0f}%)")
        elif de_ratio < 80:
            score += 1.0
            reasons.append(f"Dette maîtrisée (D/E={de_ratio:.0f}%)")
        elif de_ratio > 200:
            score -= 2.0
            reasons.append(f"Endettement élevé (D/E={de_ratio:.0f}%)")
        elif de_ratio > 100:
            score -= 1.0
            reasons.append(f"Dette significative (D/E={de_ratio:.0f}%)")

    current_ratio = fundamentals.get("current_ratio")
    if current_ratio is not None:
        if current_ratio > 2:
            score += 1.0
            reasons.append(f"Bonne liquidité (current ratio={current_ratio:.1f})")
        elif current_ratio < 1:
            score -= 1.5
            reasons.append(f"Liquidité tendue (current ratio={current_ratio:.1f})")

    # Volatilité approchée par l'amplitude 52W
    high_52w = fundamentals.get("week_52_high")
    low_52w = fundamentals.get("week_52_low")
    if high_52w and low_52w and low_52w > 0:
        amplitude = (high_52w - low_52w) / low_52w
        if amplitude > 0.80:
            score -= 2.0
            reasons.append(f"Titre très volatile (amplitude 52W : {amplitude:.0%})")
        elif amplitude > 0.50:
            score -= 1.0
            reasons.append(f"Volatilité élevée (amplitude 52W : {amplitude:.0%})")
        elif amplitude < 0.20:
            score += 1.0
            reasons.append(f"Titre stable (amplitude 52W : {amplitude:.0%})")

    # Pertes récurrentes = risque accru
    net_margin = fundamentals.get("net_margin")
    if net_margin is not None and net_margin < 0:
        score -= 1.5
        reasons.append("Entreprise en perte — risque de dilution ou de refinancement")

    # Taille de l'entreprise (small caps = moins de liquidité, plus de volatilité)
    # Note : score risque élevé = FAIBLE risque, donc small cap = score réduit
    market_cap = fundamentals.get("market_cap")
    if market_cap is not None:
        if market_cap < 300_000_000:       # < 300M = micro cap
            score -= 1.5
            reasons.append(f"Micro-cap ({market_cap/1e6:.0f}M) — liquidité et risque opérationnel élevés")
        elif market_cap < 2_000_000_000:   # < 2B = small cap
            score -= 0.5
            reasons.append(f"Small-cap ({market_cap/1e6:.0f}M) — volatilité plus élevée")
        elif market_cap > 50_000_000_000:  # > 50B = large cap
            score += 0.5
            reasons.append(f"Large-cap ({market_cap/1e9:.0f}B) — stabilité et liquidité élevées")

    if not reasons:
        reasons.append("Données de risque insuffisantes")

    return {"score": round(_clamp(score), 1), "reasons": reasons}


def compute_all_scores(fundamentals: dict, price_changes: dict) -> dict:
    """
    Calcule tous les scores et le score composite.
    Retourne un dict avec chaque score, ses raisons, et le composite.
    """
    quality = score_quality(fundamentals)
    valuation = score_valuation(fundamentals, price_changes)
    growth = score_growth(fundamentals)
    momentum = score_momentum(price_changes)
    risk = score_risk(fundamentals, price_changes)

    # Score composite pondéré
    composite = (
        quality["score"] * SCORE_WEIGHTS["quality"]
        + valuation["score"] * SCORE_WEIGHTS["valuation"]
        + growth["score"] * SCORE_WEIGHTS["growth"]
        + momentum["score"] * SCORE_WEIGHTS["momentum"]
        + risk["score"] * SCORE_WEIGHTS["risk"]
    )

    return {
        "quality": quality,
        "valuation": valuation,
        "growth": growth,
        "momentum": momentum,
        "risk": risk,
        "composite": round(_clamp(composite), 1),
        "weights": SCORE_WEIGHTS,
    }


def get_score_label(score: float) -> str:
    """Convertit un score numérique en label lisible."""
    if score >= 8:
        return "Excellent"
    elif score >= 6.5:
        return "Bon"
    elif score >= 5:
        return "Neutre"
    elif score >= 3.5:
        return "Faible"
    else:
        return "Très faible"
