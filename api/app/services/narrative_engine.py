"""
Moteur de narration — analyse qualitative rule-based.

Transforme les données brutes (fondamentaux, scores, news, earnings)
en paragraphes narratifs structurés couvrant :
  - Résumé exécutif (2-3 phrases)
  - Fondamentaux (profitabilité, croissance, valorisation, bilan, analystes, actionnaires)
  - Contexte sectoriel (données réelles vs ETF sectoriel)
  - Position concurrentielle (métriques comparées aux pairs)
  - Facteurs de risque (basés sur les données réelles)
  - Catalyseurs à surveiller

Pas de LLM — templates conditionnels + logique métier.
"""
import logging
from datetime import datetime, date

from app.services.scanner import SCAN_UNIVERSE, get_competitors
from app.services.data_service import get_price_changes, get_earnings_calendar

logger = logging.getLogger(__name__)

# ── ETFs sectoriels pour comparaison de performance ─────────────────────────
SECTOR_ETFS = {
    "Tech US": "QQQ",
    "Semi-conducteurs": "SOXX",
    "Finance US": "XLF",
    "Santé US": "XLV",
    "Énergie": "XLE",
    "Consommation US": "XLY",
    "Industriels & Défense": "XLI",
    "Europe Large Caps": "EWG",
    "Growth / Spéculatif": "ARKK",
    "Matières premières": "GLD",
}

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
        "sector_context": _build_sector_context(ticker, sector_name, momentum_score, changes),
        "competitive_position": _build_competitive(ticker, composite, sector_name, fundamentals),
        "risk_factors": _build_risks(risk, fundamentals, sector_name, changes),
        "catalyst_watch": _build_catalysts(ticker, news, changes, fundamentals),
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


# ── Helpers pour formater les nombres ────────────────────────────────────────

def _fmt_pct(val: float | None) -> str | None:
    """Formate un ratio (0.15) en pourcentage lisible (15.0%)."""
    if val is None:
        return None
    return f"{val * 100:.1f}%"


def _fmt_big(val: float | None) -> str | None:
    """Formate un grand nombre en B/M lisible."""
    if val is None:
        return None
    if abs(val) >= 1e9:
        return f"{val / 1e9:.1f}B"
    if abs(val) >= 1e6:
        return f"{val / 1e6:.0f}M"
    return f"{val:,.0f}"


# ── Fondamentaux ─────────────────────────────────────────────────────────────

def _build_fundamentals(fundamentals: dict, quality: float, valuation: float, growth: float) -> str:
    """
    Narration sur les fondamentaux couvrant 6 axes :
    profitabilité, croissance, valorisation, bilan, analystes, actionnaires.
    Utilise les clés snake_case retournées par get_fundamentals().
    """
    parts = []

    # ── 1. Profitabilité ──
    op_m = fundamentals.get("operating_margin")
    net_m = fundamentals.get("net_margin")
    gross_m = fundamentals.get("gross_margin")
    roe = fundamentals.get("roe")
    roa = fundamentals.get("roa")

    margins_available = [v for v in [op_m, net_m, gross_m] if v is not None]
    if margins_available:
        # Construire une phrase synthétique sur les marges
        margin_parts = []
        if gross_m is not None:
            margin_parts.append(f"brute {_fmt_pct(gross_m)}")
        if op_m is not None:
            margin_parts.append(f"opérationnelle {_fmt_pct(op_m)}")
        if net_m is not None:
            margin_parts.append(f"nette {_fmt_pct(net_m)}")
        margin_str = ", ".join(margin_parts)

        # Qualifier la profitabilité sur la base de la marge opérationnelle (priorité) ou nette
        ref_margin = op_m if op_m is not None else net_m
        if ref_margin is not None and ref_margin > 0.30:
            parts.append(f"Profitabilité excellente (marges {margin_str}), témoignant d'un pricing power fort.")
        elif ref_margin is not None and ref_margin > 0.15:
            parts.append(f"Profitabilité solide (marges {margin_str}), reflet d'une gestion efficace.")
        elif ref_margin is not None and ref_margin > 0:
            parts.append(f"Profitabilité modeste (marges {margin_str}), peu de marge de manoeuvre en ralentissement.")
        elif ref_margin is not None:
            parts.append(f"Entreprise déficitaire (marges {margin_str}), modèle économique à surveiller.")

    if roe is not None and roa is not None:
        # ROE > 20% = excellent, > 10% = correct
        # ROA > 10% = excellent, > 5% = correct
        if roe > 0.20:
            parts.append(f"Le ROE ({_fmt_pct(roe)}) et le ROA ({_fmt_pct(roa)}) confirment une allocation du capital efficace.")
        elif roe > 0.10:
            parts.append(f"Rentabilité correcte (ROE {_fmt_pct(roe)}, ROA {_fmt_pct(roa)}).")
        elif roe > 0:
            parts.append(f"Rentabilité faible (ROE {_fmt_pct(roe)}, ROA {_fmt_pct(roa)}), capital mal rémunéré.")
        else:
            parts.append(f"ROE négatif ({_fmt_pct(roe)}) — l'entreprise détruit de la valeur.")

    # ── 2. Croissance ──
    rev_g = fundamentals.get("revenue_growth")
    earn_g = fundamentals.get("earnings_growth")
    earn_qg = fundamentals.get("earnings_quarterly_growth")

    growth_vals = [v for v in [rev_g, earn_g, earn_qg] if v is not None]
    if growth_vals:
        growth_parts = []
        if rev_g is not None:
            growth_parts.append(f"CA {_fmt_pct(rev_g)}")
        if earn_g is not None:
            growth_parts.append(f"bénéfices {_fmt_pct(earn_g)}")
        if earn_qg is not None:
            growth_parts.append(f"BPA trimestriel {_fmt_pct(earn_qg)}")
        growth_str = ", ".join(growth_parts)

        # Accélération ou décélération ?
        if earn_qg is not None and earn_g is not None and earn_qg > earn_g:
            accel = " La croissance trimestrielle accélère par rapport à l'annuel."
        elif earn_qg is not None and earn_g is not None and earn_qg < earn_g:
            accel = " La croissance trimestrielle décélère — momentum à surveiller."
        else:
            accel = ""

        best_growth = max(growth_vals)
        if best_growth > 0.25:
            parts.append(f"Croissance impressionnante ({growth_str}).{accel}")
        elif best_growth > 0.10:
            parts.append(f"Croissance soutenue ({growth_str}).{accel}")
        elif best_growth > 0:
            parts.append(f"Croissance modeste ({growth_str}).{accel}")
        else:
            parts.append(f"Croissance négative ({growth_str}) — contraction en cours.{accel}")

    # ── 3. Valorisation ──
    pe = fundamentals.get("pe_ratio")
    fwd_pe = fundamentals.get("forward_pe")
    ev_ebitda = fundamentals.get("ev_to_ebitda")
    ptb = fundamentals.get("price_to_book")
    peg = fundamentals.get("peg_ratio")

    val_parts = []
    if pe is not None and fwd_pe is not None:
        # Compression/expansion du PE : forward < trailing = marché attend amélioration
        if fwd_pe < pe * 0.85:
            val_parts.append(f"PE en compression ({pe:.1f}x trailing → {fwd_pe:.1f}x forward), le marché anticipe une amélioration des bénéfices.")
        elif fwd_pe > pe * 1.10:
            val_parts.append(f"PE en expansion ({pe:.1f}x → {fwd_pe:.1f}x forward), le marché anticipe un ralentissement.")
        else:
            val_parts.append(f"PE stable ({pe:.1f}x trailing, {fwd_pe:.1f}x forward).")
    elif pe is not None:
        if pe > 40:
            val_parts.append(f"PE élevé ({pe:.1f}x) — valorisation tendue.")
        elif pe > 20:
            val_parts.append(f"PE raisonnable ({pe:.1f}x).")
        elif pe > 0:
            val_parts.append(f"PE attractif ({pe:.1f}x).")

    if peg is not None:
        # PEG < 1 = sous-évalué par rapport à la croissance, > 2 = cher
        if peg < 1:
            val_parts.append(f"PEG de {peg:.2f} — valorisation attractive par rapport à la croissance.")
        elif peg > 2:
            val_parts.append(f"PEG de {peg:.2f} — la croissance ne justifie pas la valorisation actuelle.")

    if ev_ebitda is not None:
        if ev_ebitda > 25:
            val_parts.append(f"EV/EBITDA élevé ({ev_ebitda:.1f}x).")
        elif ev_ebitda < 10:
            val_parts.append(f"EV/EBITDA modéré ({ev_ebitda:.1f}x).")

    if val_parts:
        parts.append(" ".join(val_parts))

    # ── 4. Bilan ──
    de = fundamentals.get("debt_to_equity")
    cr = fundamentals.get("current_ratio")
    qr = fundamentals.get("quick_ratio")
    cash = fundamentals.get("cash")
    total_debt = fundamentals.get("total_debt")
    fcf = fundamentals.get("free_cashflow")
    op_cf = fundamentals.get("operating_cashflow")

    bilan_parts = []
    if de is not None:
        if de > 200:
            bilan_parts.append(f"endettement élevé (D/E {de:.0f}%)")
        elif de < 30:
            bilan_parts.append(f"bilan très sain (D/E {de:.0f}%)")
        else:
            bilan_parts.append(f"endettement modéré (D/E {de:.0f}%)")

    if cash is not None and total_debt is not None:
        # Cash vs dette : ratio de couverture
        if total_debt > 0:
            coverage = cash / total_debt
            if coverage > 1:
                bilan_parts.append(f"trésorerie ({_fmt_big(cash)}) couvre la dette ({_fmt_big(total_debt)})")
            else:
                bilan_parts.append(f"dette ({_fmt_big(total_debt)}) supérieure à la trésorerie ({_fmt_big(cash)})")

    if fcf is not None and op_cf is not None and op_cf > 0:
        # Taux de conversion FCF/OCF : mesure l'efficacité de la conversion du cash opérationnel en cash libre
        conversion = fcf / op_cf
        if conversion > 0.7:
            bilan_parts.append(f"conversion FCF/OCF forte ({conversion:.0%})")
        elif conversion > 0.4:
            bilan_parts.append(f"conversion FCF/OCF correcte ({conversion:.0%})")
        else:
            bilan_parts.append(f"conversion FCF/OCF faible ({conversion:.0%}) — capex élevé")
    elif fcf is not None:
        if fcf > 0:
            bilan_parts.append(f"FCF positif ({_fmt_big(fcf)})")
        else:
            bilan_parts.append("FCF négatif — consommation de cash")

    if bilan_parts:
        parts.append("Bilan : " + ", ".join(bilan_parts) + ".")

    # ── 5. Sentiment analystes ──
    target = fundamentals.get("target_price")
    analyst_n = fundamentals.get("analyst_count")
    reco = fundamentals.get("recommendation")

    if target is not None:
        # On a besoin du prix actuel — on l'extrait du PE et des earnings ou on le skip
        # On utilise le fait que target_price est absolu
        analyst_parts = []
        if reco is not None:
            analyst_parts.append(f"consensus « {reco} »")
        if analyst_n is not None:
            analyst_parts.append(f"{analyst_n} analystes")
        analyst_parts.append(f"objectif {target:.0f}")
        parts.append("Analystes : " + ", ".join(analyst_parts) + ".")

    # ── 6. Retour aux actionnaires ──
    div_yield = fundamentals.get("dividend_yield")
    div_rate = fundamentals.get("dividend_rate")
    short_shares = fundamentals.get("shares_short")
    float_shares = fundamentals.get("float_shares")

    shareholder_parts = []
    if div_yield is not None and div_yield > 0:
        shareholder_parts.append(f"dividende {_fmt_pct(div_yield)} ({div_rate:.2f}/action)" if div_rate else f"dividende {_fmt_pct(div_yield)}")

    if short_shares is not None and float_shares is not None and float_shares > 0:
        short_pct = short_shares / float_shares
        if short_pct > 0.10:
            shareholder_parts.append(f"short interest élevé ({_fmt_pct(short_pct)} du flottant) — potentiel de short squeeze")
        elif short_pct > 0.05:
            shareholder_parts.append(f"short interest notable ({_fmt_pct(short_pct)} du flottant)")

    if shareholder_parts:
        parts.append("Actionnariat : " + ", ".join(shareholder_parts) + ".")

    if not parts:
        return "Données fondamentales insuffisantes pour une analyse détaillée."

    return " ".join(parts)


# ── Contexte sectoriel ───────────────────────────────────────────────────────

def _build_sector_context(ticker: str, sector_name: str | None, momentum: float, changes: dict) -> str:
    """
    Contexte sectoriel enrichi avec données réelles de l'ETF sectoriel.
    Compare la performance du ticker à celle de son ETF de référence.
    """
    if not sector_name or sector_name not in SECTOR_TEMPLATES:
        return "Secteur non couvert par l'univers d'analyse."

    template = SECTOR_TEMPLATES[sector_name]

    # ── Performance réelle de l'ETF sectoriel ──
    etf_ticker = SECTOR_ETFS.get(sector_name)
    etf_changes = None
    if etf_ticker:
        try:
            etf_changes = get_price_changes(etf_ticker)
        except Exception:
            logger.warning("Impossible de récupérer les données pour l'ETF %s", etf_ticker)

    # Momentum du secteur basé sur les données réelles si disponibles
    if etf_changes:
        etf_1m = etf_changes.get("change_1m")
        etf_3m = etf_changes.get("change_3m")

        if etf_1m is not None and etf_1m > 5:
            mom_desc = "affiche une dynamique haussière forte"
        elif etf_1m is not None and etf_1m > 0:
            mom_desc = "évolue en légère hausse"
        elif etf_1m is not None and etf_1m > -5:
            mom_desc = "subit un repli modéré"
        elif etf_1m is not None:
            mom_desc = "est en correction marquée"
        else:
            mom_desc = "évolue dans une tendance indéterminée"
    else:
        # Fallback sur le score momentum
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

    # ── Comparaison ticker vs ETF sectoriel ──
    if etf_changes:
        ticker_1m = changes.get("change_1m")
        ticker_3m = changes.get("change_3m")
        etf_1m = etf_changes.get("change_1m")
        etf_3m = etf_changes.get("change_3m")

        if ticker_1m is not None and etf_1m is not None:
            diff_1m = ticker_1m - etf_1m
            if diff_1m > 5:
                context += f" {ticker} surperforme nettement son secteur ({etf_ticker}) de {diff_1m:+.1f}pp sur 1 mois."
            elif diff_1m > 0:
                context += f" {ticker} surperforme légèrement {etf_ticker} ({diff_1m:+.1f}pp sur 1 mois)."
            elif diff_1m > -5:
                context += f" {ticker} sous-performe légèrement {etf_ticker} ({diff_1m:+.1f}pp sur 1 mois)."
            else:
                context += f" {ticker} sous-performe significativement {etf_ticker} ({diff_1m:+.1f}pp sur 1 mois)."

        # Signal de rotation sectorielle
        if etf_1m is not None and etf_3m is not None:
            if etf_1m > 3 and etf_3m > 5:
                context += " Flux positifs vers le secteur — rotation sectorielle favorable."
            elif etf_1m < -3 and etf_3m < -5:
                context += " Flux sortants du secteur — rotation défavorable."

    return context


# ── Position concurrentielle ─────────────────────────────────────────────────

def _build_competitive(ticker: str, composite: float, sector_name: str | None, fundamentals: dict) -> str:
    """Position concurrentielle vs pairs avec comparaison de métriques clés."""
    competitors = get_competitors(ticker)
    if not competitors:
        return "Position concurrentielle non évaluable — ticker hors de l'univers scanné."

    from app.services.data_service import get_fundamentals
    from app.services.scoring import compute_all_scores

    comp_data = []
    for ct in competitors[:4]:
        try:
            ct_changes = get_price_changes(ct)
            ct_fund = get_fundamentals(ct)
            ct_scores = compute_all_scores(ct_fund, ct_changes)
            comp_data.append({"ticker": ct, "composite": ct_scores["composite"], "fund": ct_fund})
        except Exception:
            continue

    if not comp_data:
        return f"Comparaison concurrentielle non disponible pour les pairs du secteur {sector_name or 'inconnu'}."

    avg_comp = sum(d["composite"] for d in comp_data) / len(comp_data)
    best = max(comp_data, key=lambda x: x["composite"])
    worst = min(comp_data, key=lambda x: x["composite"])

    # Position globale
    if composite > avg_comp + 1:
        position = f"{ticker} surperforme nettement ses pairs (score {composite:.1f} vs moyenne secteur {avg_comp:.1f})."
    elif composite > avg_comp:
        position = f"{ticker} se positionne au-dessus de la moyenne de son secteur ({composite:.1f} vs {avg_comp:.1f})."
    elif composite > avg_comp - 1:
        position = f"{ticker} est dans la moyenne de son secteur ({composite:.1f} vs {avg_comp:.1f})."
    else:
        position = f"{ticker} sous-performe ses pairs ({composite:.1f} vs moyenne secteur {avg_comp:.1f})."

    position += f" Meilleur profil : {best['ticker']} ({best['composite']:.1f}), plus faible : {worst['ticker']} ({worst['composite']:.1f})."

    # ── Comparaison de métriques spécifiques ──
    # Trouver les forces/faiblesses relatives
    my_op_m = fundamentals.get("operating_margin")
    my_rev_g = fundamentals.get("revenue_growth")
    my_pe = fundamentals.get("pe_ratio")

    advantages = []
    weaknesses = []

    for cd in comp_data:
        ct = cd["ticker"]
        cf = cd["fund"]

        # Marge opérationnelle
        ct_op_m = cf.get("operating_margin")
        if my_op_m is not None and ct_op_m is not None:
            if my_op_m > ct_op_m + 0.05:
                advantages.append(f"marges supérieures à {ct}")
            elif ct_op_m > my_op_m + 0.05:
                weaknesses.append(f"marges inférieures à {ct}")

        # Croissance
        ct_rev_g = cf.get("revenue_growth")
        if my_rev_g is not None and ct_rev_g is not None:
            if my_rev_g > ct_rev_g + 0.05:
                advantages.append(f"croissance supérieure à {ct}")
            elif ct_rev_g > my_rev_g + 0.05:
                weaknesses.append(f"croissance inférieure à {ct}")

        # Valorisation
        ct_pe = cf.get("pe_ratio")
        if my_pe is not None and ct_pe is not None and ct_pe > 0 and my_pe > 0:
            if my_pe < ct_pe * 0.8:
                advantages.append(f"moins cher que {ct} (PE {my_pe:.0f}x vs {ct_pe:.0f}x)")
            elif my_pe > ct_pe * 1.2:
                weaknesses.append(f"plus cher que {ct} (PE {my_pe:.0f}x vs {ct_pe:.0f}x)")

    # Dédupliquer et limiter
    if advantages:
        position += f" Points forts : {', '.join(advantages[:3])}."
    if weaknesses:
        position += f" Points faibles : {', '.join(weaknesses[:3])}."

    return position


# ── Risques ──────────────────────────────────────────────────────────────────

def _build_risks(risk_score: float, fundamentals: dict, sector_name: str | None, changes: dict) -> str:
    """Identification des facteurs de risque basés sur les données réelles."""
    risks = []

    # ── Short interest élevé ──
    short_shares = fundamentals.get("shares_short")
    float_shares = fundamentals.get("float_shares")
    if short_shares is not None and float_shares is not None and float_shares > 0:
        short_pct = short_shares / float_shares
        if short_pct > 0.05:
            risks.append(f"Short interest significatif ({short_pct * 100:.1f}% du flottant) — pression vendeuse ou potentiel de squeeze.")

    # ── Survalorisation vs croissance ──
    pe = fundamentals.get("pe_ratio")
    rev_g = fundamentals.get("revenue_growth")
    if pe is not None and pe > 40 and rev_g is not None and rev_g < 0.10:
        risks.append(f"Risque de survalorisation : PE de {pe:.0f}x pour une croissance de seulement {_fmt_pct(rev_g)} — décalage prix/fondamentaux.")

    # ── Liquidité ──
    cr = fundamentals.get("current_ratio")
    if cr is not None and cr < 1:
        risks.append(f"Ratio de liquidité courante inférieur à 1 ({cr:.2f}) — risque de tension sur le fonds de roulement.")

    # ── FCF négatif ──
    fcf = fundamentals.get("free_cashflow")
    if fcf is not None and fcf < 0:
        risks.append(f"Free cash-flow négatif ({_fmt_big(fcf)}) — l'entreprise consomme du cash, financement externe nécessaire.")

    # ── Analystes baissiers ──
    target = fundamentals.get("target_price")
    current_price = changes.get("current_price")
    if target is not None and current_price is not None and current_price > 0:
        upside = (target - current_price) / current_price
        if upside < 0:
            risks.append(f"Objectif analystes ({target:.0f}) inférieur au cours actuel ({current_price:.0f}) — downside de {upside * 100:.0f}%.")

    # ── Small cap en secteur volatil ──
    market_cap = fundamentals.get("market_cap")
    volatile_sectors = {"Growth / Spéculatif", "Semi-conducteurs", "Matières premières"}
    if market_cap is not None and market_cap < 5e9 and sector_name in volatile_sectors:
        risks.append(f"Small cap ({_fmt_big(market_cap)}) dans un secteur volatil — liquidité limitée et risque amplifié.")
    elif market_cap is not None and market_cap < 2e9:
        risks.append(f"Small cap ({_fmt_big(market_cap)}) — liquidité potentiellement limitée.")

    # ── Endettement ──
    de = fundamentals.get("debt_to_equity")
    if de is not None and de > 150:
        risks.append(f"Endettement élevé (D/E {de:.0f}%) — vulnérabilité en cas de hausse des taux ou ralentissement.")

    # ── Marge nette négative ──
    net_m = fundamentals.get("net_margin")
    if net_m is not None and net_m < 0:
        risks.append("Entreprise non rentable — risque de dilution ou besoin de financement.")

    # ── Risques sectoriels ──
    if sector_name and sector_name in SECTOR_TEMPLATES:
        risks.append(f"Risques sectoriels : {SECTOR_TEMPLATES[sector_name]['risks']}.")

    if not risks:
        return "Pas de facteur de risque majeur identifié à ce stade."

    return " ".join(risks)


# ── Catalyseurs ──────────────────────────────────────────────────────────────

def _build_catalysts(ticker: str, news: list[dict], changes: dict, fundamentals: dict) -> str:
    """Catalyseurs à surveiller, enrichis avec les données fondamentales."""
    catalysts = []

    # ── Earnings ──
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

    # ── Upside analystes significatif ──
    target = fundamentals.get("target_price")
    current_price = changes.get("current_price")
    if target is not None and current_price is not None and current_price > 0:
        upside = (target - current_price) / current_price
        if upside > 0.15:
            catalysts.append(f"Objectif analystes ({target:.0f}) implique un upside de {upside * 100:.0f}% — potentiel de revalorisation.")

    # ── Golden / Death cross (50 vs 200 jours) ──
    fifty = fundamentals.get("fifty_day_avg")
    two_hundred = fundamentals.get("two_hundred_day_avg")
    if fifty is not None and two_hundred is not None and two_hundred > 0:
        cross_ratio = fifty / two_hundred
        if cross_ratio > 1.02:
            catalysts.append("Moyenne mobile 50j au-dessus de la 200j — signal haussier (golden cross).")
        elif cross_ratio < 0.98:
            catalysts.append("Moyenne mobile 50j sous la 200j — signal baissier (death cross).")

    # ── Accélération des bénéfices ──
    earn_qg = fundamentals.get("earnings_quarterly_growth")
    if earn_qg is not None and earn_qg > 0.10:
        catalysts.append(f"Accélération des bénéfices trimestriels ({_fmt_pct(earn_qg)}) — momentum positif sur les résultats.")

    # ── News récentes ──
    if news:
        bullish_kw = {"beat", "record", "upgrade", "buyback", "partnership", "growth", "FDA", "approval", "contract"}
        bearish_kw = {"miss", "downgrade", "cut", "layoffs", "recall", "lawsuit", "warning", "investigation", "delay"}
        for n in news[:3]:
            title = n.get("title", "").lower()
            if any(kw in title for kw in bullish_kw):
                catalysts.append(f"Actualité positive : « {n.get('title', '')[:80]} »")
                break
            elif any(kw in title for kw in bearish_kw):
                catalysts.append(f"Actualité négative : « {n.get('title', '')[:80]} »")
                break

    # ── Rebond potentiel ──
    pct_high = changes.get("pct_from_52w_high")
    if pct_high is not None and pct_high < -30:
        catalysts.append(f"Le titre est à {pct_high:.0f}% de son plus haut 52 semaines — rebond technique possible si les fondamentaux tiennent.")

    if not catalysts:
        return "Pas de catalyseur majeur identifié à court terme."

    return " ".join(catalysts)
