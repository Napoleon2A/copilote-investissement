"""
Moteur de narration — analyse qualitative rule-based.

Transforme les données brutes (fondamentaux, scores, news, earnings)
en paragraphes narratifs structurés couvrant :
  - Résumé exécutif (2-3 phrases)
  - Fondamentaux (marges, croissance, bilan)
  - Contexte sectoriel
  - Position concurrentielle
  - Facteurs de risque
  - Catalyseurs à surveiller

Pas de LLM — templates conditionnels + logique métier.
"""
import logging
from datetime import datetime, date

from app.services.scanner import SCAN_UNIVERSE, get_competitors
from app.services.data_service import get_price_changes, get_earnings_calendar

logger = logging.getLogger(__name__)

# ── Templates par secteur ────────────────────────────────────────────────────

SECTOR_TEMPLATES = {
    "Tech US": {
        "context": "Le secteur technologique américain {momentum}. Les valorisations restent {valuation_tone} par rapport aux moyennes historiques, avec un focus du marché sur l'IA générative et le cloud computing.",
        "risks": "exposition aux tensions commerciales sino-américaines, régulation antitrust, dépendance aux dépenses d'investissement des entreprises",
    },
    "Semi-conducteurs": {
        "context": "Le cycle des semi-conducteurs {momentum}. La demande est tirée par l'IA, les data centers et l'automobile électrique. Les délais de livraison et les investissements en capacité restent des facteurs clés.",
        "risks": "nature cyclique prononcée, dépendance géographique (TSMC/Taiwan), surcapacité potentielle post-cycle IA",
    },
    "Finance US": {
        "context": "Le secteur financier {momentum}. L'environnement de taux {rate_context} impacte directement les marges d'intérêt nettes. L'activité M&A et les marchés de capitaux restent des moteurs de revenus.",
        "risks": "sensibilité aux taux directeurs, risque de crédit en cas de récession, pression réglementaire post-SVB",
    },
    "Santé US": {
        "context": "Le secteur santé {momentum}. L'innovation (oncologie, thérapies géniques, dispositifs médicaux robotisés) reste un moteur structurel. Les pipelines de développement et les approbations FDA sont des catalyseurs majeurs.",
        "risks": "risque réglementaire sur les prix des médicaments, échecs cliniques, expiration de brevets",
    },
    "Énergie": {
        "context": "Le secteur énergétique {momentum}. La transition vers les renouvelables crée une dichotomie entre les acteurs traditionnels (pétrole/gaz) et les pure players solaire/éolien. Les prix du brut {oil_context}.",
        "risks": "volatilité des prix du brut, risque de transition énergétique pour les fossiles, subventions politiquement dépendantes pour les renouvelables",
    },
    "Consommation US": {
        "context": "La consommation américaine {momentum}. Le pouvoir d'achat des ménages et la confiance des consommateurs sont les indicateurs clés. Le e-commerce continue de gagner des parts de marché.",
        "risks": "sensibilité à l'inflation et aux taux, concurrence intense sur les prix, changements de comportement consommateur",
    },
    "Industriels & Défense": {
        "context": "Le secteur industriel et défense {momentum}. Les budgets de défense occidentaux sont en hausse structurelle (contexte géopolitique). L'industrie bénéficie de la relocalisation et des infrastructures.",
        "risks": "dépendance aux contrats gouvernementaux, risques de supply chain, cyclicité industrielle",
    },
    "Europe Large Caps": {
        "context": "Les grandes capitalisations européennes {momentum}. Le luxe, l'aéronautique et l'énergie restent les piliers de la surperformance européenne. Le taux EUR/USD et la politique de la BCE sont des facteurs macro clés.",
        "risks": "croissance économique européenne modeste, risques géopolitiques (Ukraine, Proche-Orient), force de l'euro sur les exportateurs",
    },
    "Growth / Spéculatif": {
        "context": "Les valeurs de croissance spéculatives {momentum}. Ce segment est très sensible aux conditions de liquidité et au sentiment risk-on/risk-off. Les catalyseurs sont souvent binaires (contrats, approbations, profitabilité).",
        "risks": "volatilité extrême, absence de profitabilité pour la plupart, dilution fréquente, dépendance au financement",
    },
    "Matières premières": {
        "context": "Le secteur des matières premières {momentum}. Les prix des métaux sont influencés par la demande chinoise, la transition énergétique (cuivre, lithium) et les conditions d'offre (mines, géopolitique).",
        "risks": "cyclicité forte, risque-pays (Amérique latine, Afrique), coûts de production variables, risques ESG",
    },
}


def generate_narrative(
    ticker: str,
    fundamentals: dict,
    scores: dict,
    changes: dict,
    news: list[dict],
    info: dict,
) -> dict:
    """
    Génère une analyse narrative complète pour un ticker.

    Returns:
        dict avec sections : summary, fundamentals_narrative, sector_context,
        competitive_position, risk_factors, catalyst_watch
    """
    name = info.get("longName") or info.get("shortName") or ticker
    sector_name = _find_sector(ticker)
    composite = scores.get("composite", 5.0)
    quality = scores.get("quality", {}).get("score", 5.0) if isinstance(scores.get("quality"), dict) else 5.0
    valuation = scores.get("valuation", {}).get("score", 5.0) if isinstance(scores.get("valuation"), dict) else 5.0
    growth = scores.get("growth", {}).get("score", 5.0) if isinstance(scores.get("growth"), dict) else 5.0
    momentum_score = scores.get("momentum", {}).get("score", 5.0) if isinstance(scores.get("momentum"), dict) else 5.0
    risk = scores.get("risk", {}).get("score", 5.0) if isinstance(scores.get("risk"), dict) else 5.0

    return {
        "summary": _build_summary(ticker, name, composite, quality, changes),
        "fundamentals_narrative": _build_fundamentals(fundamentals, quality, valuation, growth),
        "sector_context": _build_sector_context(sector_name, momentum_score),
        "competitive_position": _build_competitive(ticker, composite, sector_name),
        "risk_factors": _build_risks(risk, fundamentals, sector_name),
        "catalyst_watch": _build_catalysts(ticker, news, changes),
    }


def _find_sector(ticker: str) -> str | None:
    """Trouve le secteur d'un ticker dans SCAN_UNIVERSE."""
    for sector, tickers in SCAN_UNIVERSE.items():
        if ticker.upper() in tickers:
            return sector
    return None


def _build_summary(ticker: str, name: str, composite: float, quality: float, changes: dict) -> str:
    """Résumé exécutif en 2-3 phrases."""
    price = changes.get("current_price", 0)
    change_1m = changes.get("change_1m")
    pct_high = changes.get("pct_from_52w_high")

    # Tendance
    if change_1m is not None and change_1m > 10:
        trend = f"en forte hausse (+{change_1m:.1f}% sur 1 mois)"
    elif change_1m is not None and change_1m > 3:
        trend = f"en progression (+{change_1m:.1f}% sur 1 mois)"
    elif change_1m is not None and change_1m < -10:
        trend = f"sous pression ({change_1m:.1f}% sur 1 mois)"
    elif change_1m is not None and change_1m < -3:
        trend = f"en repli ({change_1m:.1f}% sur 1 mois)"
    else:
        trend = "stable"

    # Qualité
    if composite >= 7.5:
        assessment = f"Le profil de {name} est solide avec un score composite de {composite:.1f}/10."
    elif composite >= 6.0:
        assessment = f"{name} présente un profil intéressant (score {composite:.1f}/10) méritant un approfondissement."
    elif composite >= 4.5:
        assessment = f"Le profil de {name} est mitigé (score {composite:.1f}/10) avec des points d'attention."
    else:
        assessment = f"{name} affiche un profil défavorable (score {composite:.1f}/10) avec des faiblesses marquées."

    # Distance au plus haut
    high_note = ""
    if pct_high is not None and pct_high < -25:
        high_note = f" Le titre se situe à {pct_high:.0f}% de son plus haut 52 semaines, ce qui peut représenter une opportunité si les fondamentaux le justifient."
    elif pct_high is not None and pct_high > -5:
        high_note = " Le titre évolue proche de ses plus hauts historiques."

    return f"{ticker} ({name}) est {trend} à {price:.2f}. {assessment}{high_note}"


def _build_fundamentals(fundamentals: dict, quality: float, valuation: float, growth: float) -> str:
    """Narration sur les fondamentaux : marges, croissance, bilan."""
    parts = []

    # Marges
    op_margin = fundamentals.get("operatingMargins")
    net_margin = fundamentals.get("profitMargins")
    if op_margin is not None:
        if op_margin > 0.30:
            parts.append(f"La marge opérationnelle est excellente ({op_margin*100:.1f}%), témoignant d'un avantage compétitif durable et d'un fort pricing power.")
        elif op_margin > 0.15:
            parts.append(f"La marge opérationnelle ({op_margin*100:.1f}%) est solide, reflétant une gestion efficace des coûts.")
        elif op_margin > 0:
            parts.append(f"La marge opérationnelle ({op_margin*100:.1f}%) est modeste, laissant peu de marge de manœuvre en cas de ralentissement.")
        else:
            parts.append(f"L'entreprise est déficitaire au niveau opérationnel ({op_margin*100:.1f}%), un signal d'alerte sur la viabilité du modèle actuel.")

    # Croissance
    rev_growth = fundamentals.get("revenueGrowth")
    if rev_growth is not None:
        if rev_growth > 0.25:
            parts.append(f"La croissance du chiffre d'affaires est impressionnante ({rev_growth*100:.1f}%), positionnant l'entreprise comme un leader de croissance dans son secteur.")
        elif rev_growth > 0.10:
            parts.append(f"La croissance des revenus ({rev_growth*100:.1f}%) est saine et soutenue.")
        elif rev_growth > 0:
            parts.append(f"La croissance est modeste ({rev_growth*100:.1f}%), l'entreprise évolue dans un marché mature ou compétitif.")
        else:
            parts.append(f"Le chiffre d'affaires est en contraction ({rev_growth*100:.1f}%), un signal de perte de parts de marché ou de vents contraires sectoriels.")

    # Bilan
    debt_equity = fundamentals.get("debtToEquity")
    if debt_equity is not None:
        if debt_equity > 200:
            parts.append(f"L'endettement est élevé (D/E : {debt_equity:.0f}%), limitant la flexibilité financière et augmentant la vulnérabilité en cas de hausse des taux.")
        elif debt_equity < 30:
            parts.append(f"Le bilan est très sain (D/E : {debt_equity:.0f}%), offrant une marge de sécurité importante et la capacité de financer la croissance.")

    # FCF
    fcf = fundamentals.get("freeCashflow")
    if fcf is not None:
        if fcf > 0:
            fcf_b = fcf / 1e9
            if fcf_b > 1:
                parts.append(f"Le free cash-flow ({fcf_b:.1f}B) est positif et significatif, permettant des retours aux actionnaires (buybacks, dividendes) ou des acquisitions.")
            else:
                parts.append(f"Le free cash-flow est positif ({fcf/1e6:.0f}M), signe de discipline financière.")
        else:
            parts.append("Le free cash-flow est négatif — l'entreprise consomme du cash, ce qui nécessite un financement externe ou limite les retours aux actionnaires.")

    if not parts:
        return "Données fondamentales insuffisantes pour une analyse détaillée."

    return " ".join(parts)


def _build_sector_context(sector_name: str | None, momentum: float) -> str:
    """Contexte sectoriel basé sur les templates."""
    if not sector_name or sector_name not in SECTOR_TEMPLATES:
        return "Secteur non couvert par l'univers d'analyse."

    template = SECTOR_TEMPLATES[sector_name]

    # Déterminer le momentum du secteur
    if momentum >= 7:
        mom_desc = "affiche une dynamique positive"
    elif momentum >= 5:
        mom_desc = "évolue dans une tendance neutre"
    else:
        mom_desc = "subit des pressions baissières"

    context = template["context"].format(
        momentum=mom_desc,
        valuation_tone="élevées" if momentum >= 6 else "modérées",
        rate_context="restrictif" if momentum < 5 else "favorable",
        oil_context="restent soutenus par les restrictions d'offre" if momentum >= 5 else "subissent des pressions à la baisse",
    )

    return context


def _build_competitive(ticker: str, composite: float, sector_name: str | None) -> str:
    """Position concurrentielle vs pairs."""
    competitors = get_competitors(ticker)
    if not competitors:
        return "Position concurrentielle non évaluable — ticker hors de l'univers scanné."

    # Comparer les scores composites
    comp_scores = []
    for ct in competitors[:4]:
        try:
            ct_changes = get_price_changes(ct)
            from app.services.data_service import get_fundamentals
            ct_fund = get_fundamentals(ct)
            from app.services.scoring import compute_all_scores
            ct_scores = compute_all_scores(ct_fund, ct_changes)
            comp_scores.append((ct, ct_scores["composite"]))
        except Exception:
            continue

    if not comp_scores:
        return f"Comparaison concurrentielle non disponible pour les pairs du secteur {sector_name or 'inconnu'}."

    avg_comp = sum(s for _, s in comp_scores) / len(comp_scores)
    best = max(comp_scores, key=lambda x: x[1])
    worst = min(comp_scores, key=lambda x: x[1])

    if composite > avg_comp + 1:
        position = f"{ticker} surperforme nettement ses pairs (score {composite:.1f} vs moyenne secteur {avg_comp:.1f})."
    elif composite > avg_comp:
        position = f"{ticker} se positionne au-dessus de la moyenne de son secteur ({composite:.1f} vs {avg_comp:.1f})."
    elif composite > avg_comp - 1:
        position = f"{ticker} est dans la moyenne de son secteur ({composite:.1f} vs {avg_comp:.1f})."
    else:
        position = f"{ticker} sous-performe ses pairs ({composite:.1f} vs moyenne secteur {avg_comp:.1f})."

    position += f" Le meilleur profil du secteur est {best[0]} ({best[1]:.1f}/10), le plus faible est {worst[0]} ({worst[1]:.1f}/10)."

    return position


def _build_risks(risk_score: float, fundamentals: dict, sector_name: str | None) -> str:
    """Identification des facteurs de risque."""
    risks = []

    # Risques liés au score
    if risk_score < 4:
        risks.append("Le profil de risque est élevé selon nos critères quantitatifs (score risque faible).")
    elif risk_score < 5.5:
        risks.append("Le profil de risque est modéré — surveiller les développements.")

    # Risques fondamentaux
    debt_equity = fundamentals.get("debtToEquity")
    if debt_equity and debt_equity > 150:
        risks.append(f"Endettement significatif (D/E : {debt_equity:.0f}%) exposant l'entreprise en cas de hausse des taux ou de ralentissement.")

    net_margin = fundamentals.get("profitMargins")
    if net_margin is not None and net_margin < 0:
        risks.append("L'entreprise n'est pas rentable — risque de dilution ou de financement supplémentaire.")

    market_cap = fundamentals.get("marketCap")
    if market_cap and market_cap < 2e9:
        risks.append("Small cap — liquidité potentiellement limitée et volatilité plus élevée.")

    # Risques sectoriels
    if sector_name and sector_name in SECTOR_TEMPLATES:
        risks.append(f"Risques sectoriels : {SECTOR_TEMPLATES[sector_name]['risks']}.")

    if not risks:
        return "Pas de facteur de risque majeur identifié."

    return " ".join(risks)


def _build_catalysts(ticker: str, news: list[dict], changes: dict) -> str:
    """Catalyseurs à surveiller."""
    catalysts = []

    # Earnings
    try:
        cal = get_earnings_calendar(ticker)
        earnings_str = cal.get("earnings_date")
        if earnings_str and str(earnings_str) != "None":
            earnings_dt = date.fromisoformat(str(earnings_str)[:10])
            days_until = (earnings_dt - date.today()).days
            if 0 <= days_until <= 30:
                catalysts.append(f"Publication de résultats le {earnings_dt.strftime('%d/%m/%Y')} (dans {days_until} jours) — catalyseur majeur à court terme.")
    except Exception:
        pass

    # News récentes
    if news:
        bullish_kw = {"beat", "record", "upgrade", "buyback", "partnership", "growth", "FDA"}
        bearish_kw = {"miss", "downgrade", "cut", "layoffs", "recall", "lawsuit", "warning"}
        for n in news[:3]:
            title = n.get("title", "").lower()
            if any(kw in title for kw in bullish_kw):
                catalysts.append(f"Actualité positive récente : « {n.get('title', '')[:80]} »")
                break
            elif any(kw in title for kw in bearish_kw):
                catalysts.append(f"Actualité négative récente : « {n.get('title', '')[:80]} »")
                break

    # Momentum
    pct_high = changes.get("pct_from_52w_high")
    if pct_high is not None and pct_high < -30:
        catalysts.append(f"Le titre est à {pct_high:.0f}% de son plus haut 52 semaines — un rebond technique pourrait constituer un catalyseur si les fondamentaux tiennent.")

    if not catalysts:
        return "Pas de catalyseur majeur identifié à court terme."

    return " ".join(catalysts)
