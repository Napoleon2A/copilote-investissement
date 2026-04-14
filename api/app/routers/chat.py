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

    # Détection de concept
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
    news = get_news(ticker, count=3)

    composite = scores["composite"]
    label = get_score_label(composite)

    # Construction de la réponse textuelle
    price = changes.get("current_price", 0)
    change_1d = changes.get("change_1d")
    change_1m = changes.get("change_1m")

    lines = [f"## {ticker} — {name}"]
    lines.append(f"**Prix :** {price:.2f} | **Aujourd'hui :** {change_1d:+.2f}%" if change_1d else f"**Prix :** {price:.2f}")
    if change_1m:
        lines.append(f"**1 mois :** {change_1m:+.2f}%")
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

    # News
    if news:
        lines.append("\n**Dernières actualités :**")
        for n in news[:2]:
            lines.append(f"• {n.get('title', '')}")

    # Verdict
    if composite >= 7.5:
        verdict = "Ce titre mérite d'être approfondi."
    elif composite >= 6:
        verdict = "À surveiller — pas urgent mais intéressant."
    else:
        verdict = "Score insuffisant pour agir — surveiller sans urgence."

    lines.append(f"\n**Verdict :** {verdict}")

    return ChatResponse(
        type="analysis",
        text="\n".join(lines),
        data={
            "ticker": ticker,
            "price": price,
            "change_1d": change_1d,
            "scores": {k: scores[k]["score"] if isinstance(scores[k], dict) else scores[k]
                       for k in ["quality", "valuation", "growth", "momentum", "risk", "composite"]},
            "news": [{"title": n.get("title"), "publisher": n.get("publisher")} for n in news[:3]],
        },
    )


async def _handle_opportunities(ticker: Optional[str]) -> ChatResponse:
    """Retourne les meilleures opportunités du moment."""
    opportunities = run_scan(max_results=5)

    if not opportunities:
        return ChatResponse(
            type="opportunities",
            text="Aucune opportunité claire détectée en ce moment. Le marché ne présente pas de signal fort au-dessus du seuil de score 6/10.",
        )

    lines = ["## Meilleures opportunités détectées\n"]
    for i, opp in enumerate(opportunities, 1):
        t = opp["ticker"]
        score = opp["scores"]["composite"]
        action = opp["action_label"]
        highlight = opp["highlights"][0] if opp["highlights"] else "—"
        lines.append(f"**{i}. {t}** — {score}/10 → {action}")
        lines.append(f"   ↳ {highlight}")
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
