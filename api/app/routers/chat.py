"""
Route : chatbot d'investissement
  POST /chat  → répond à une question en langage naturel

Le chatbot analyse la question, appelle les bons services,
et retourne une réponse structurée + textuelle.

Il n'utilise pas de LLM externe — il interprète des intentions
simples et les traduit en requêtes vers les données disponibles.

Intentions reconnues :
  - Analyse d'un ticker (AAPL, MSFT, etc.)
  - Meilleures opportunités du moment
  - Etat du portefeuille
  - Résumé de marché
  - Explication d'un concept (P/E, momentum, etc.)
  - News récentes sur un ticker
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from typing import Optional
import re
import logging

from app.database import get_session
from app.models import Position, Portfolio, Company
from app.services.data_service import (
    get_price_changes, get_fundamentals, get_news, get_company_info,
)
from app.services.scoring import compute_all_scores, get_score_label
from app.services.scanner import run_scan, run_macro_scan
from app.services.brief_service import _get_market_summary

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)

# ── Lexique de concepts financiers ────────────────────────────────────────────
CONCEPTS = {
    "p/e": (
        "Le P/E (Price-to-Earnings) mesure combien tu paies pour 1€ de bénéfice. "
        "P/E = Prix de l'action / Bénéfice par action. "
        "Un P/E de 20 signifie que le marché paie 20x les bénéfices actuels. "
        "Bas (<15) = potentiellement sous-évalué. Haut (>30) = croissance attendue ou surévaluation. "
        "Attention : un P/E négatif signifie que l'entreprise est en perte."
    ),
    "ev/ebitda": (
        "L'EV/EBITDA compare la valeur d'entreprise (dette + capitalisation) "
        "aux bénéfices avant intérêts, impôts et amortissements. "
        "Plus robuste que le P/E car non impacté par la structure de capital. "
        "< 8x = potentiellement attractif. > 20x = prime de croissance ou secteur premium."
    ),
    "momentum": (
        "Le momentum mesure la tendance récente du prix. "
        "Un titre en momentum fort (hausse sur 1-3 mois) a statistiquement "
        "plus de chances de continuer à monter à court terme. "
        "Mais attention : le momentum peut s'inverser brutalement."
    ),
    "roe": (
        "Le ROE (Return on Equity) mesure combien une entreprise génère de profit "
        "pour chaque euro investi par ses actionnaires. "
        "ROE > 15% = bonne rentabilité. > 25% = excellent. "
        "Un ROE négatif = l'entreprise détruit de la valeur."
    ),
    "score composite": (
        "Le score composite est la note globale du système (0-10). "
        "Il pondère : Qualité (30%), Valorisation (25%), Croissance (20%), "
        "Momentum (15%), Risque (10%). "
        "Score ≥ 7.5 = Excellent | 6.5-7.5 = Bon | 5-6.5 = Neutre | < 5 = Faible."
    ),
    "vix": (
        "Le VIX est l'indice de la peur — il mesure la volatilité attendue du S&P 500. "
        "VIX < 15 = marché complaisant (attention aux retournements). "
        "VIX 15-25 = conditions normales. "
        "VIX > 30 = peur élevée (souvent une opportunité d'achat). "
        "VIX > 40 = panique (rare — achat agressif historiquement profitable)."
    ),
    "short squeeze": (
        "Un short squeeze se produit quand beaucoup de vendeurs à découvert "
        "sont forcés de racheter simultanément, ce qui amplifie la hausse. "
        "Signal : ratio court élevé + mouvement haussier inattendu."
    ),
    "dcf": (
        "Le DCF (Discounted Cash Flow) valorise une entreprise en actualisant "
        "ses flux de trésorerie futurs. C'est la méthode la plus rigoureuse "
        "mais aussi la plus sensible aux hypothèses. "
        "Une petite erreur sur le taux de croissance change massivement la valorisation."
    ),
    "fcf": (
        "Le FCF (Free Cash Flow) est le cash réellement généré après les investissements. "
        "FCF = Cash opérationnel - Capex. "
        "C'est l'un des meilleurs indicateurs de la santé réelle d'une entreprise. "
        "FCF yield > 5% = très attractif. Une entreprise avec FCF négatif brûle du cash "
        "et dépend des marchés pour se financer."
    ),
    "tarif": (
        "Les tarifs douaniers (droits de douane) taxent les importations. "
        "Impact sur les marchés : hausse des coûts pour les entreprises importatrices, "
        "pression inflationniste, risque de guerre commerciale. "
        "Secteurs exposés : tech hardware, automobile, retail, agriculture. "
        "Secteurs potentiellement bénéficiaires : industriels domestiques, défense."
    ),
    "récession": (
        "Une récession est définie techniquement par 2 trimestres consécutifs de PIB négatif. "
        "Impact marché : repli des cycliques (banques, industriels), surperformance des défensifs "
        "(santé, utilities, consommation de base). "
        "Le VIX monte, les taux baissent généralement, le dollar peut se renforcer. "
        "Historiquement, les récessions créent des opportunités d'achat si on a du cash disponible."
    ),
    "fed": (
        "La Fed (Federal Reserve) est la banque centrale américaine. "
        "Elle fixe les taux directeurs (Fed Funds Rate) qui influencent tout le marché. "
        "Taux hausse → coût de financement plus cher → pression sur les actions de croissance et l'immobilier. "
        "Taux baisse → liquidités abondantes → bénéfique pour les actifs risqués. "
        "Les réunions FOMC ont lieu environ 8 fois par an — elles font bouger les marchés."
    ),
    "géopolitique": (
        "Les événements géopolitiques (guerres, sanctions, élections) créent de la volatilité. "
        "Impact typique : hausse du pétrole (conflits au Moyen-Orient), "
        "fuite vers l'or et le dollar, pression sur les émergents. "
        "Secteurs bénéficiaires dans les crises : défense (LMT, RTX, NOC), énergie, or (GDX). "
        "Secteurs pénalisés : tech internationale, transport aérien, tourisme."
    ),
    "inflation": (
        "L'inflation mesure la hausse générale des prix. "
        "Haute inflation → la Fed remonte les taux → pression sur les valorisations. "
        "Secteurs performants en inflation : énergie, matières premières, immobilier, banques. "
        "Secteurs pénalisés : tech growth (valorisations actualisées à taux plus élevés), obligations. "
        "Le CPI (Consumer Price Index) est publié mensuellement — c'est le chiffre clé à suivre."
    ),
    "earnings": (
        "Les earnings (résultats trimestriels) sont les publications financières des entreprises. "
        "Ils comprennent : chiffre d'affaires, bénéfice net, EPS (bénéfice par action), guidance. "
        "Si les résultats dépassent les attentes des analystes = surprise positive → hausse. "
        "Si en-dessous = déception → baisse parfois brutale (-5 à -20% en une séance). "
        "Positionner avant les earnings = pari risqué. Attendre après = plus sûr mais moins rentable."
    ),
    "buyback": (
        "Un buyback (rachat d'actions) = l'entreprise rachète ses propres actions sur le marché. "
        "Effet mécanique : le nombre d'actions baisse → EPS augmente → prix par action monte. "
        "Signal positif : la direction pense que l'action est sous-évaluée. "
        "Apple, Microsoft et Google ont parmi les plus gros programmes de rachat au monde."
    ),
}


class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = None  # ticker actif si l'utilisateur est sur une fiche


class ChatResponse(BaseModel):
    type: str        # "analysis" | "opportunities" | "portfolio" | "market" | "concept" | "error"
    text: str        # Réponse en langage naturel
    data: Optional[dict] = None  # Données structurées associées


def _extract_ticker(text: str) -> Optional[str]:
    """
    Extrait un ticker boursier d'un texte.
    Cherche des séquences de 2-6 lettres majuscules (ou avec .PA, .L, etc.)
    """
    text_upper = text.upper()

    # Chercher des patterns de ticker explicites
    patterns = [
        r'\b([A-Z]{2,6})\b',           # Ticker US simple (AAPL, MSFT)
        r'\b([A-Z]{2,5}\.[A-Z]{1,2})\b', # Ticker européen (MC.PA, AIR.PA)
    ]
    stop_words = {
        "ET", "LE", "LA", "LES", "DE", "DU", "UN", "UNE", "EST", "EN",
        "SUR", "AU", "AUX", "PAR", "POUR", "AVEC", "DANS", "QUE", "QUI",
        "CE", "IL", "EL", "ETA", "THE", "AND", "OR", "FOR", "IS", "IN",
        "ON", "AT", "TO", "BY", "AN", "AS", "BE", "DO", "IF", "MY",
        "QUOI", "MOI", "TOI", "LUI", "EUX", "SOI", "CAR", "MAIS", "DONC",
        "QUAND", "COMMENT", "POURQUOI", "QUEL", "QUELLE", "QUELS", "QUELLES",
    }

    for pattern in patterns:
        matches = re.findall(pattern, text_upper)
        for match in matches:
            if match not in stop_words and len(match) >= 2:
                return match
    return None


def _detect_intent(message: str) -> dict:
    """
    Détecte l'intention de la question.
    Retourne {"intent": str, "ticker": str|None, "concept": str|None}
    """
    msg = message.lower()

    # Détection de concept — inclut les alias communs
    CONCEPT_ALIASES = {
        "géopolitique": "géopolitique",
        "geopolitique": "géopolitique",
        "geopolit": "géopolitique",
        "guerre": "géopolitique",
        "conflit": "géopolitique",
        "sanction": "géopolitique",
        "tarif": "tarif",
        "douane": "tarif",
        "trade war": "tarif",
        "récession": "récession",
        "recession": "récession",
        "inflation": "inflation",
        "cpi": "inflation",
        "fed ": "fed",
        "federal reserve": "fed",
        "taux directeur": "fed",
        "fomc": "fed",
        "earnings": "earnings",
        "résultats": "earnings",
        "trimestriel": "earnings",
        "buyback": "buyback",
        "rachat d'actions": "buyback",
        "fcf": "fcf",
        "free cash flow": "fcf",
    }
    for alias, concept_key in CONCEPT_ALIASES.items():
        if alias in msg:
            return {"intent": "concept", "concept": concept_key, "ticker": None}
    for concept in CONCEPTS:
        if concept in msg:
            return {"intent": "concept", "concept": concept, "ticker": None}

    # Détection de ticker
    ticker = _extract_ticker(message)

    # Intentions liées au marché global
    if any(kw in msg for kw in ["marché", "market", "macro", "secteur", "economie", "économie", "vix", "sp500", "sp 500", "nasdaq", "cac"]):
        return {"intent": "market", "ticker": ticker}

    # Intentions liées au portefeuille
    if any(kw in msg for kw in ["portefeuille", "portfolio", "position", "pnl", "gain", "perte", "performance", "holdings"]):
        return {"intent": "portfolio", "ticker": None}

    # Intentions liées aux opportunités
    if any(kw in msg for kw in ["opportunit", "idée", "invest", "acheter", "achat", "buy", "meilleur", "top", "scanner", "signal"]):
        return {"intent": "opportunities", "ticker": ticker}

    # Intentions liées aux news
    if any(kw in msg for kw in ["news", "actualité", "actualite", "nouvelles", "info"]):
        return {"intent": "news", "ticker": ticker}

    # Si ticker détecté → analyse de ce ticker
    if ticker:
        return {"intent": "analysis", "ticker": ticker}

    # Par défaut : opportunités
    return {"intent": "opportunities", "ticker": None}


async def _handle_analysis(ticker: str) -> ChatResponse:
    """Analyse complète d'un ticker."""
    from app.services.data_service import get_earnings_calendar
    changes = get_price_changes(ticker)
    if not changes:
        return ChatResponse(
            type="error",
            text=f"Je n'ai pas trouvé de données pour **{ticker}**. Vérifie que c'est un ticker valide (ex: AAPL, MC.PA).",
        )

    fundamentals = get_fundamentals(ticker)
    scores = compute_all_scores(fundamentals, changes)
    info = get_company_info(ticker)
    name = info.get("longName") or info.get("shortName") or ticker
    news = get_news(ticker, count=5)

    composite = scores["composite"]
    label = get_score_label(composite)

    # Construction de la réponse textuelle
    price = changes.get("current_price", 0)
    change_1d = changes.get("change_1d")
    change_1m = changes.get("change_1m")
    pct_from_high = changes.get("pct_from_52w_high")

    lines = [f"## {ticker} — {name}"]
    price_line = f"**Prix :** {price:.2f}"
    if change_1d is not None:
        price_line += f" | **Aujourd'hui :** {change_1d:+.2f}%"
    if change_1m is not None:
        price_line += f" | **1M :** {change_1m:+.1f}%"
    if pct_from_high is not None and pct_from_high < -10:
        price_line += f" | **vs 52W haut :** {pct_from_high:+.1f}%"
    lines.append(price_line)
    lines.append(f"\n**Score composite : {composite}/10** ({label})")

    # Points forts et faibles
    pros = []
    cons = []
    for key in ["quality", "valuation", "growth", "momentum"]:
        s = scores[key]
        if s["score"] >= 6.5:
            reasons = [r for r in s.get("reasons", []) if "insuffisant" not in r.lower()]
            if reasons:
                pros.append(reasons[0])
        elif s["score"] <= 4:
            reasons = [r for r in s.get("reasons", []) if "insuffisant" not in r.lower()]
            if reasons:
                cons.append(reasons[0])

    if pros:
        lines.append("\n**Points favorables :**")
        for p in pros[:3]:
            lines.append(f"+ {p}")

    if cons:
        lines.append("\n**Points d'attention :**")
        for c in cons[:3]:
            lines.append(f"− {c}")

    # Earnings calendar — alerte si résultats imminents
    try:
        cal = get_earnings_calendar(ticker)
        earnings_str = cal.get("earnings_date")
        if earnings_str and str(earnings_str) != "None":
            from datetime import date as _d, datetime as _dt
            earnings_dt = _d.fromisoformat(str(earnings_str)[:10])
            days_until = (earnings_dt - _dt.utcnow().date()).days
            if 0 <= days_until <= 21:
                lines.append(f"\n⚠ **Résultats dans {days_until}j** ({earnings_dt.strftime('%d/%m')}) — risque de volatilité, position à calibrer avec soin")
    except Exception:
        pass

    # News récentes
    if news:
        lines.append("\n**Dernières actualités :**")
        for n in news[:3]:
            lines.append(f"• {n.get('title', '')}")

    # Verdict actionnable
    risk_score = scores["risk"]["score"]
    if composite >= 7.5 and risk_score >= 5:
        verdict = "Initier une petite position ou l'approfondir sérieusement."
        action_key = "buy_small"
    elif composite >= 7.0:
        verdict = "À approfondir avant d'agir — score solide mais vérifier la thèse."
        action_key = "read"
    elif composite >= 6.0:
        verdict = "À surveiller — intéressant mais pas d'urgence."
        action_key = "watch"
    elif composite >= 4:
        verdict = "Score insuffisant pour initier une position actuellement."
        action_key = "avoid"
    else:
        verdict = "Profil défavorable — éviter ou alléger si en portefeuille."
        action_key = "avoid"

    lines.append(f"\n**Verdict :** {verdict}")

    return ChatResponse(
        type="analysis",
        text="\n".join(lines),
        data={
            "ticker": ticker,
            "price": price,
            "change_1d": change_1d,
            "action": action_key,
            "scores": {k: scores[k]["score"] if isinstance(scores[k], dict) else scores[k]
                       for k in ["quality", "valuation", "growth", "momentum", "risk", "composite"]},
            "news": [{"title": n.get("title"), "publisher": n.get("publisher")} for n in news[:3]],
        },
    )


async def _handle_opportunities(ticker: Optional[str]) -> ChatResponse:
    """Retourne les meilleures opportunités du moment, contextualisées par le régime macro."""
    opportunities = run_scan(max_results=5)
    macro = run_macro_scan()
    risk_regime = macro.get("risk_regime", "neutral")
    vix = macro.get("vix")

    if not opportunities:
        return ChatResponse(
            type="opportunities",
            text="Aucune opportunité claire détectée en ce moment. Le marché ne présente pas de signal fort au-dessus du seuil de score 6/10.",
        )

    # Contexte macro en intro
    regime_lines = {
        "risk-on": "Marché risk-on (VIX bas) — conditions favorables pour initier des positions sur la croissance.",
        "risk-off": "⚠ Marché risk-off — VIX élevé, préférer des positions réduites et des valeurs défensives.",
        "calme": "Marché calme — bonne visibilité, conditions normales pour agir.",
        "vigilance": "⚠ Volatilité modérée — calibrer la taille des positions avec prudence.",
        "neutral": "Conditions de marché normales.",
    }
    regime_desc = regime_lines.get(risk_regime, "")
    if vix:
        regime_desc += f" VIX : {vix:.1f}."

    lines = ["## Meilleures opportunités détectées\n"]
    if regime_desc:
        lines.append(f"*{regime_desc}*\n")

    for i, opp in enumerate(opportunities, 1):
        t = opp["ticker"]
        score = opp["scores"]["composite"]
        action = opp["action_label"]
        highlights = opp.get("highlights", [])
        highlight = highlights[0] if highlights else "—"
        lines.append(f"**{i}. {t}** — {score}/10 → {action}")
        lines.append(f"   ↳ {highlight}")
        if len(highlights) > 1:
            lines.append(f"   ↳ {highlights[1]}")
        if opp.get("upside_vs_target"):
            lines.append(f"   ↳ Upside analystes : {opp['upside_vs_target']:+.1f}%")
        lines.append("")

    lines.append("*Clique sur un ticker pour l'analyse complète.*")

    return ChatResponse(
        type="opportunities",
        text="\n".join(lines),
        data={"opportunities": opportunities},
    )


async def _handle_market() -> ChatResponse:
    """Résumé du marché et analyse macro."""
    summary = _get_market_summary()
    macro = run_macro_scan()

    lines = ["## Situation de marché\n"]

    # Indices principaux
    for name, idx in summary.items():
        price = idx.get("price")
        change = idx.get("change_1d")
        if price and change is not None:
            arrow = "▲" if change > 0 else "▼"
            lines.append(f"**{name}** : {price:,.0f} {arrow} {change:+.2f}%")

    # Régime de risque
    regime = macro.get("risk_regime", "neutral")
    vix = macro.get("vix")
    regime_descriptions = {
        "risk-on": "Marché en mode risk-on — les investisseurs prennent des risques. Conditions favorables aux actions de croissance.",
        "risk-off": "Marché en mode risk-off — fuite vers les actifs sûrs. Prudence recommandée.",
        "calme": "Conditions de marché calmes — faible volatilité, bonne visibilité.",
        "vigilance": "Volatilité modérée — surveiller les développements macro.",
        "neutral": "Conditions neutres.",
    }
    lines.append(f"\n**Régime de risque :** {regime_descriptions.get(regime, regime)}")
    if vix:
        lines.append(f"**VIX :** {vix:.1f}")

    # Secteurs en surperformance
    outperf = macro.get("outperformers", [])
    if outperf:
        lines.append(f"\n**Secteurs forts (YTD vs SP500) :**")
        for s in outperf[:3]:
            lines.append(f"• {s['sector']} (+{s['outperformance']:.1f}% vs marché)")

    underperf = macro.get("underperformers", [])
    if underperf:
        lines.append(f"\n**Secteurs faibles (YTD vs SP500) :**")
        for s in underperf[:3]:
            lines.append(f"• {s['sector']} ({s['underperformance']:.1f}% vs marché) — chercher des décotes")

    return ChatResponse(
        type="market",
        text="\n".join(lines),
        data={"summary": summary, "macro": macro},
    )


async def _handle_news(ticker: Optional[str]) -> ChatResponse:
    """News récentes sur un ticker ou le marché général."""
    if not ticker:
        return ChatResponse(
            type="error",
            text="Précise un ticker pour voir ses actualités. Exemple : *news sur AAPL*",
        )

    news = get_news(ticker, count=8)
    if not news:
        return ChatResponse(
            type="error",
            text=f"Aucune actualité récente trouvée pour **{ticker}**.",
        )

    lines = [f"## Actualités — {ticker}\n"]
    for n in news:
        title = n.get("title", "")
        publisher = n.get("publisher", "")
        pub_date = n.get("published", "")
        date_str = ""
        if pub_date:
            try:
                from datetime import datetime as dt
                d = dt.fromisoformat(pub_date[:10])
                date_str = f" · {d.strftime('%d/%m')}"
            except Exception:
                pass
        lines.append(f"• **{title}**")
        if publisher or date_str:
            lines.append(f"  *{publisher}{date_str}*")
        lines.append("")

    return ChatResponse(
        type="news",
        text="\n".join(lines),
        data={"ticker": ticker, "news": news},
    )


async def _handle_concept(concept: str) -> ChatResponse:
    """Explication d'un concept financier."""
    explanation = CONCEPTS.get(concept, "")
    if not explanation:
        return ChatResponse(
            type="error",
            text=f"Je n'ai pas d'explication pour '{concept}'. Essaie P/E, EV/EBITDA, momentum, ROE, VIX, score composite.",
        )
    return ChatResponse(
        type="concept",
        text=f"## {concept.upper()}\n\n{explanation}",
        data={"concept": concept},
    )


@router.post("")
async def chat(
    request: ChatRequest,
    session: AsyncSession = Depends(get_session),
) -> ChatResponse:
    """
    Point d'entrée du chatbot.
    Analyse la question et retourne une réponse structurée.
    """
    message = request.message.strip()
    if not message:
        return ChatResponse(type="error", text="Pose-moi une question !")

    intent_data = _detect_intent(message)
    intent = intent_data["intent"]
    ticker = intent_data.get("ticker") or request.context

    logger.info(f"Chat: intent={intent}, ticker={ticker}, message='{message[:50]}'")

    try:
        if intent == "analysis" and ticker:
            return await _handle_analysis(ticker)
        elif intent == "opportunities":
            return await _handle_opportunities(ticker)
        elif intent == "market":
            return await _handle_market()
        elif intent == "news":
            return await _handle_news(ticker)
        elif intent == "concept":
            return await _handle_concept(intent_data.get("concept", ""))
        elif intent == "portfolio":
            # Récupérer les positions pour répondre sur le portefeuille
            portfolio_result = await session.exec(select(Portfolio))
            portfolio = portfolio_result.first()
            if not portfolio:
                return ChatResponse(
                    type="portfolio",
                    text="Ton portefeuille est vide. Va dans Portefeuille → + Transaction pour ajouter une position.",
                )
            return ChatResponse(
                type="portfolio",
                text="Va dans l'onglet **Portefeuille** pour voir tes positions, P&L et exposition sectorielle en temps réel.",
                data={"portfolio_id": portfolio.id},
            )
        else:
            # Fallback : essayer une analyse si ticker détecté, sinon opportunités
            if ticker:
                return await _handle_analysis(ticker)
            return await _handle_opportunities(None)

    except Exception as e:
        logger.error(f"Erreur chatbot: {e}")
        return ChatResponse(
            type="error",
            text="Une erreur s'est produite. Réessaie ou reformule ta question.",
        )
