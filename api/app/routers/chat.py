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


class HistoryMessage(BaseModel):
    role: str   # "user" | "assistant"
    text: str
    data: Optional[dict] = None


class ChatRequest(BaseModel):
    message: str
    context: Optional[str] = None       # ticker actif si l'utilisateur est sur une fiche
    history: list[HistoryMessage] = []  # Historique de la conversation


class ChatResponse(BaseModel):
    type: str        # "analysis" | "opportunities" | "portfolio" | "market" | "concept" | "error"
    text: str        # Réponse en langage naturel
    data: Optional[dict] = None  # Données structurées associées


STOP_WORDS = {
    # Articles et pronoms FR
    "ET", "LE", "LA", "LES", "DE", "DU", "UN", "UNE", "EST", "EN",
    "SUR", "AU", "AUX", "PAR", "POUR", "AVEC", "DANS", "QUE", "QUI",
    "CE", "IL", "EL", "ETA", "MOI", "TOI", "LUI", "EUX", "SOI",
    "MON", "TON", "SON", "MES", "TES", "SES", "NOS", "VOS", "MA", "SA",
    "JE", "TU", "ON", "ILS", "ELLES", "NOUS", "VOUS",
    # Mots FR courants qui ressemblent à des tickers
    "QUOI", "CAR", "MAIS", "DONC", "QUAND", "COMMENT", "POURQUOI",
    "QUEL", "QUELLE", "QUELS", "QUELLES", "DONNE", "COURS", "PRIX",
    "VOIR", "AIDE", "HAUT", "BAS", "PLUS", "MOINS", "TRES", "BIEN",
    "TOUT", "TOUS", "TOUTES", "FAIRE", "DIRE", "ALLER", "VENIR",
    "PEUX", "PEUT", "VEUX", "VEUT", "DOIS", "DOIT",
    "MOIS", "JOURS", "JOUR", "HIER", "DEMAIN", "MEME", "COMME",
    "FOND", "PART", "PARTS", "AVEC", "SANS", "SOUS",
    # Adjectifs et mots courants confondus avec tickers
    "BON", "BONNE", "BONS", "BONNES", "MAUVAIS", "MAUVAISE",
    "GRAND", "GRANDE", "PETIT", "PETITE", "PREMIER", "PREMIERE",
    "DERNIER", "DERNIERE", "IDEE", "IDÉE", "MEILLEUR", "MEILLEURE",
    "ACTUEL", "ACTUELLE", "GLOBAL", "LOCALE", "SEUL", "SEULE",
    "FORTE", "FORT", "FAIBLE", "MOYEN", "NEUTRE", "RISQUE",
    "ACHAT", "VENTE", "BOURSE", "ACTION", "ACTIONS", "MARCHE",
    "SECTEUR", "HAUSSE", "BAISSE", "TREND", "COTE", "LISTE",
    # Anglais
    "THE", "AND", "OR", "FOR", "IS", "IN", "ON", "AT", "TO", "BY",
    "AN", "AS", "BE", "DO", "IF", "MY", "IT", "OF", "NO", "SO",
    "VS", "VA", "VU", "OU", "UX", "OK", "GO",
    # Mots financiers qui ne sont pas des tickers
    "ETF", "IPO", "SPY", "TER", "NAV", "AUM",
}

# Correspondance noms communs → tickers Yahoo Finance
# Permet de dire "LVMH", "Total", "Tesla" sans connaître le ticker exact
COMPANY_NAME_TO_TICKER = {
    # France / Europe
    "LVMH": "MC.PA",
    "TOTAL": "TTE.PA",
    "TOTALENERGIES": "TTE.PA",
    "AIRBUS": "AIR.PA",
    "AIRFRANCE": "AF.PA",
    "BNP": "BNP.PA",
    "BNPPARIBAS": "BNP.PA",
    "SOCIETE GENERALE": "GLE.PA",
    "SOCIETEGENERALE": "GLE.PA",
    "SOGENE": "GLE.PA",
    "SANOFI": "SAN.PA",
    "LOREAL": "OR.PA",
    "HERMES": "RMS.PA",
    "KERING": "KER.PA",
    "PERNOD": "RI.PA",
    "PERNODRICARD": "RI.PA",
    "MICHELIN": "ML.PA",
    "RENAULT": "RNO.PA",
    "STELLANTIS": "STLA",
    "DASSAULT": "AM.PA",
    "SCHNEIDER": "SU.PA",
    "SAFRAN": "SAF.PA",
    "VINCI": "DG.PA",
    "SAINT GOBAIN": "SGO.PA",
    "SAINTGOBAIN": "SGO.PA",
    "CAPGEMINI": "CAP.PA",
    "LEGRAND": "LR.PA",
    "PUBLICIS": "PUB.PA",
    "CARREFOUR": "CA.PA",
    "DANONE": "BN.PA",
    "CREDIT AGRICOLE": "ACA.PA",
    "CREDITAGRICOLE": "ACA.PA",
    "AXA": "CS.PA",
    "BOUYGUES": "EN.PA",
    "EURONEXT": "ENX.PA",
    "WORLDLINE": "WLN.PA",
    "NOVONORDISK": "NVO",
    "NOVO": "NVO",
    "ASML": "ASML",
    "SAP": "SAP",
    "SIEMENS": "SIE.DE",
    "VOLKSWAGEN": "VOW.DE",
    "BMW": "BMW.DE",
    "MERCEDES": "MBG.DE",
    "ALLIANZ": "ALV.DE",
    "DEUTSCHE BANK": "DBK.DE",
    "NESTLE": "NESN.SW",
    "ROCHE": "ROG.SW",
    "NOVARTIS": "NOVN.SW",
    "UNILEVER": "UL",
    "SHELL": "SHEL",
    "BP": "BP",
    "HSBC": "HSBC",
    "RICHEMONT": "CFR.SW",
    # USA — noms courants
    "TESLA": "TSLA",
    "APPLE": "AAPL",
    "MICROSOFT": "MSFT",
    "GOOGLE": "GOOGL",
    "ALPHABET": "GOOGL",
    "AMAZON": "AMZN",
    "META": "META",
    "FACEBOOK": "META",
    "NVIDIA": "NVDA",
    "NETFLIX": "NFLX",
    "PALANTIR": "PLTR",
    "COINBASE": "COIN",
    "OPENAI": None,  # Pas coté
    "JPMORGAN": "JPM",
    "GOLDMANSACHS": "GS",
    "GOLDMAN": "GS",
    "BERKSHIRE": "BRK-B",
    "JOHNSON": "JNJ",
    "PFIZER": "PFE",
    "EXXON": "XOM",
    "CHEVRON": "CVX",
    "WALMART": "WMT",
    "VISA": "V",
    "MASTERCARD": "MA",
    "PAYPAL": "PYPL",
    "UBER": "UBER",
    "AIRBNB": "ABNB",
    "SPOTIFY": "SPOT",
    "DISNEY": "DIS",
    "SALESFORCE": "CRM",
    "ADOBE": "ADBE",
    "AMD": "AMD",
    "INTEL": "INTC",
    "QUALCOMM": "QCOM",
    "TSMC": "TSM",
    "SAMSUNG": "005930.KS",
    "LILLY": "LLY",
    "ELIYLILLY": "LLY",
    "NOVO NORDISK": "NVO",
    "MERCK": "MRK",
    "ABBVIE": "ABBV",
    "NEWMONT": "NEM",
    "FIRST SOLAR": "FSLR",
    "FIRSTSOLAR": "FSLR",
}

TICKER_PATTERNS = [
    r'\b([A-Z]{1,5}\.[A-Z]{2})\b',  # Ticker européen en premier (MC.PA, AIR.PA, BRK.B)
    r'\b([A-Z]{2,6})\b',             # Ticker US (AAPL, MSFT, NVDA)
]


def _resolve_company_name(text: str) -> Optional[str]:
    """
    Tente de résoudre un nom d'entreprise en ticker.
    Ex: "LVMH" → "MC.PA", "Tesla" → "TSLA"
    """
    text_upper = text.upper().replace(" ", "").replace("-", "").replace("_", "")
    # Essai direct
    if text_upper in COMPANY_NAME_TO_TICKER:
        return COMPANY_NAME_TO_TICKER[text_upper]
    # Essai avec texte normalisé
    text_normalized = text.upper().strip()
    if text_normalized in COMPANY_NAME_TO_TICKER:
        return COMPANY_NAME_TO_TICKER[text_normalized]
    # Recherche partielle (ex: "Novo Nordisk" → "NOVO NORDISK")
    for key, ticker in COMPANY_NAME_TO_TICKER.items():
        if key in text_normalized or text_normalized in key:
            return ticker
    return None


def _extract_ticker(text: str) -> Optional[str]:
    """
    Extrait un ticker boursier d'un texte en langage naturel.
    Essaie d'abord les noms d'entreprises connus, puis les patterns regex.
    """
    # 1. Résolution par nom d'entreprise (priorité maximale)
    resolved = _resolve_company_name(text)
    if resolved:
        return resolved

    # 2. Patterns regex — mais on filtre agressivement les mots courants
    text_upper = text.upper()
    for pattern in TICKER_PATTERNS:
        matches = re.findall(pattern, text_upper)
        for match in matches:
            if match not in STOP_WORDS and len(match) >= 2:
                # Éviter de retourner des mots du dictionnaire français évidents
                return match
    return None


def _extract_multiple_tickers(text: str, max_count: int = 3) -> list[str]:
    """
    Extrait plusieurs tickers d'un texte (utile pour les comparaisons).
    """
    # Chercher d'abord les noms connus
    found = []
    text_upper = text.upper()

    for name, ticker in COMPANY_NAME_TO_TICKER.items():
        if name in text_upper and ticker and ticker not in found:
            found.append(ticker)
        if len(found) >= max_count:
            return found

    # Compléter avec regex si pas assez trouvé
    for pattern in TICKER_PATTERNS:
        matches = re.findall(pattern, text_upper)
        for match in matches:
            if match not in STOP_WORDS and len(match) >= 2 and match not in found:
                found.append(match)
        if len(found) >= max_count:
            break

    return found[:max_count]


def _extract_context(history: list[HistoryMessage]) -> dict:
    """
    Extrait le contexte actif depuis l'historique de conversation.
    Remonte jusqu'à trouver : le dernier ticker discuté, les dernières
    opportunités montrées, et le type de la dernière réponse.
    """
    ctx = {
        "last_ticker": None,
        "last_opportunities": [],
        "last_intent": None,
    }
    for msg in reversed(history):
        if msg.role == "assistant" and msg.data:
            if not ctx["last_ticker"] and msg.data.get("ticker"):
                ctx["last_ticker"] = msg.data["ticker"]
            if not ctx["last_opportunities"] and msg.data.get("opportunities"):
                ctx["last_opportunities"] = msg.data["opportunities"]
        if ctx["last_ticker"] and ctx["last_opportunities"]:
            break
    return ctx


FOLLOWUP_RISK = {
    "risque", "risqué", "risquee", "dangereux", "sûr", "sur",
    "volatil", "volatilité", "volatilite", "prudent", "prudence",
    "protection", "stop loss", "stop-loss", "downside",
}
FOLLOWUP_BUY = {
    "acheter", "achat", "j'achète", "j achete", "je prends",
    "initier", "rentrer", "entrer", "investir", "maintenant",
    "bon moment", "bonne idée", "bonne idee", "je dois", "tu conseilles",
    "tu recommandes", "recommande", "conseille",
}
FOLLOWUP_DEEPEN = {
    "approfondis", "développe", "developpe", "dis m'en plus", "dis moi plus",
    "plus de détail", "plus de detail", "explique", "explique moi",
    "pourquoi", "comment", "creuse", "analyse plus",
}
FOLLOWUP_MORE_OPPS = {
    "autres", "encore", "suite", "montre plus", "la suite",
    "plus d'opportunités", "plus d opportunites", "voir plus",
}


def _detect_followup(msg: str, ctx: dict) -> Optional[dict]:
    """
    Détecte si le message est une question de suivi sur le contexte actif.
    Retourne None si ce n'est pas un follow-up.
    """
    msg_lower = msg.lower()
    words = set(msg_lower.split())

    # "compare avec X" ou "et X ?" en mode follow-up
    ticker_in_msg = _extract_ticker(msg)
    if ticker_in_msg and ctx["last_ticker"] and ticker_in_msg != ctx["last_ticker"]:
        if any(kw in msg_lower for kw in ["compar", " vs ", "et ", "ou ", "plutôt", "plutot"]):
            return {"intent": "compare", "tickers": [ctx["last_ticker"], ticker_in_msg]}

    # Questions sur le risque
    if FOLLOWUP_RISK & words or any(k in msg_lower for k in FOLLOWUP_RISK):
        ticker = ctx["last_ticker"]
        if not ticker and ctx["last_opportunities"]:
            opps = ctx["last_opportunities"]
            ticker = opps[0]["ticker"] if opps else None
        if ticker:
            return {"intent": "followup_risk", "ticker": ticker}

    # Questions d'achat / décision
    if FOLLOWUP_BUY & words or any(k in msg_lower for k in FOLLOWUP_BUY):
        ticker = ticker_in_msg or ctx["last_ticker"]
        # Si pas de ticker mais des opportunités affichées → utiliser la première
        if not ticker and ctx["last_opportunities"]:
            opps = ctx["last_opportunities"]
            ticker = opps[0]["ticker"] if opps else None
        if ticker:
            return {"intent": "followup_buy", "ticker": ticker}

    # Demandes d'approfondissement
    if FOLLOWUP_DEEPEN & words or any(k in msg_lower for k in FOLLOWUP_DEEPEN):
        if ctx["last_ticker"]:
            return {"intent": "analysis", "ticker": ctx["last_ticker"]}

    # "Et les autres opportunités ?"
    if FOLLOWUP_MORE_OPPS & words or any(k in msg_lower for k in FOLLOWUP_MORE_OPPS):
        if ctx["last_opportunities"]:
            return {"intent": "opportunities", "ticker": None}

    return None


async def _handle_followup_risk(ticker: str) -> ChatResponse:
    """Analyse détaillée du risque sur un ticker — réponse en mode co-gérant."""
    changes = get_price_changes(ticker)
    fundamentals = get_fundamentals(ticker)
    if not changes:
        return ChatResponse(type="error", text=f"Je n'arrive pas à récupérer les données de {ticker}.")

    scores = compute_all_scores(fundamentals, changes)
    risk = scores["risk"]
    risk_score = risk["score"]
    volatility_amplitude = None
    high_52w = fundamentals.get("week_52_high")
    low_52w = fundamentals.get("week_52_low")
    if high_52w and low_52w and low_52w > 0:
        volatility_amplitude = (high_52w - low_52w) / low_52w * 100

    lines = [f"## Analyse de risque — {ticker}\n"]
    lines.append(f"**Score risque : {risk_score}/10** {'(risque faible)' if risk_score >= 6 else '(risque modéré)' if risk_score >= 4 else '(risque élevé)'}\n")

    # Raisons du score risque
    for r in risk.get("reasons", []):
        if "insuffisant" not in r.lower():
            lines.append(f"• {r}")

    # Volatilité 52W
    if volatility_amplitude is not None:
        lines.append(f"• Amplitude 52 semaines : {volatility_amplitude:.0f}% (de {low_52w:.2f} à {high_52w:.2f})")

    # Distance depuis le plus bas
    pct_from_low = changes.get("pct_from_52w_low")
    pct_from_high = changes.get("pct_from_52w_high")
    if pct_from_high is not None:
        lines.append(f"• Actuellement {abs(pct_from_high):.0f}% sous son plus haut 52W")
    if pct_from_low is not None:
        lines.append(f"• {pct_from_low:.0f}% au-dessus de son plus bas 52W")

    # Earnings
    try:
        from app.services.data_service import get_earnings_calendar
        cal = get_earnings_calendar(ticker)
        earnings_str = cal.get("earnings_date")
        if earnings_str and str(earnings_str) != "None":
            from datetime import date as _d, datetime as _dt
            earnings_dt = _d.fromisoformat(str(earnings_str)[:10])
            days_until = (earnings_dt - _dt.utcnow().date()).days
            if 0 <= days_until <= 30:
                lines.append(f"\n⚠ **Résultats dans {days_until}j ({earnings_dt.strftime('%d/%m')})** — fort potentiel de gap. Réduire la taille de position avant la publication.")
    except Exception:
        pass

    # Verdict calibrage position
    lines.append("")
    if risk_score >= 7:
        conseil = "Profil de risque maîtrisé. Taille de position standard possible."
    elif risk_score >= 5:
        conseil = "Risque modéré. Limite la position à 3-5% du portefeuille et pose un stop."
    elif risk_score >= 3:
        conseil = "Risque élevé. Position spéculative uniquement — max 1-2% du portefeuille."
    else:
        conseil = "Profil très risqué. Éviter ou position symbolique uniquement."

    lines.append(f"**Verdict position sizing :** {conseil}")

    return ChatResponse(
        type="risk",
        text="\n".join(lines),
        data={"ticker": ticker, "risk_score": risk_score},
    )


async def _handle_followup_buy(ticker: str) -> ChatResponse:
    """Donne un avis clair sur l'achat maintenant — en mode co-gérant direct."""
    from app.services.data_service import get_earnings_calendar
    changes = get_price_changes(ticker)
    fundamentals = get_fundamentals(ticker)
    if not changes:
        return ChatResponse(type="error", text=f"Données indisponibles pour {ticker}.")

    scores = compute_all_scores(fundamentals, changes)
    composite = scores["composite"]
    risk_score = scores["risk"]["score"]
    momentum_score = scores["momentum"]["score"]
    valuation_score = scores["valuation"]["score"]

    lines = [f"## Faut-il acheter {ticker} maintenant ?\n"]

    # Arguments pour/contre structurés
    pros = []
    cons = []

    if composite >= 7:
        pros.append(f"Score composite solide ({composite}/10)")
    elif composite < 5:
        cons.append(f"Score composite insuffisant ({composite}/10) — le profil ne justifie pas une entrée")

    if valuation_score >= 6.5:
        pros.append("Valorisation attractive — tu n'overpays pas")
    elif valuation_score < 4:
        cons.append("Valorisation tendue — attendre une correction ou un meilleur point d'entrée")

    if momentum_score >= 6:
        pros.append("Momentum positif — le titre est dans le sens du marché")
    elif momentum_score < 4:
        cons.append("Momentum négatif — le titre baisse, pas de confirmation technique")

    if risk_score >= 6:
        pros.append("Risque maîtrisé — bilan solide")
    elif risk_score < 4:
        cons.append("Risque élevé — dette ou volatilité préoccupante")

    # Earnings check
    earnings_warning = None
    try:
        cal = get_earnings_calendar(ticker)
        earnings_str = cal.get("earnings_date")
        if earnings_str and str(earnings_str) != "None":
            from datetime import date as _d, datetime as _dt
            earnings_dt = _d.fromisoformat(str(earnings_str)[:10])
            days_until = (earnings_dt - _dt.utcnow().date()).days
            if 0 <= days_until <= 14:
                earnings_warning = f"Résultats dans {days_until}j ({earnings_dt.strftime('%d/%m')}) — risque de gap fort dans les deux sens"
                cons.append(earnings_warning)
    except Exception:
        pass

    if pros:
        lines.append("**Pour :**")
        for p in pros:
            lines.append(f"+ {p}")
        lines.append("")

    if cons:
        lines.append("**Contre :**")
        for c in cons:
            lines.append(f"− {c}")
        lines.append("")

    # Verdict final
    score_positifs = len(pros)
    score_negatifs = len(cons)

    if composite >= 7.5 and risk_score >= 5 and not earnings_warning:
        verdict = f"**Oui, le profil justifie une entrée.** Initie une petite position (2-4% max), pose un stop sous le plus bas récent."
    elif composite >= 6.5 and score_positifs > score_negatifs:
        verdict = f"**Plutôt oui, mais attends une confirmation.** Score correct, mais le timing n'est pas idéal. Moitié de position maintenant, l'autre si le titre tient."
    elif earnings_warning:
        verdict = f"**Attendre après les résultats.** {earnings_warning}. Trop risqué d'entrer avant la publication."
    elif composite >= 5 and momentum_score < 4:
        verdict = "**Trop tôt.** Le fondamental est correct mais le momentum est contre toi. Attendre un retournement technique avant d'entrer."
    else:
        verdict = f"**Non, le profil actuel ne justifie pas une entrée.** Score trop faible ({composite}/10). Chercher d'autres opportunités."

    lines.append(f"**Verdict :** {verdict}")
    lines.append("\n*Rappel : ceci est une heuristique, pas un conseil en investissement.*")

    return ChatResponse(
        type="buy_decision",
        text="\n".join(lines),
        data={"ticker": ticker, "composite": composite},
    )


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

    # Comparaison de plusieurs tickers
    tickers_found = _extract_multiple_tickers(message)
    if len(tickers_found) >= 2 and any(kw in msg for kw in ["compar", " vs ", " ou ", "meilleur entre", "lequel"]):
        return {"intent": "compare", "tickers": tickers_found[:2], "ticker": tickers_found[0]}

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


async def _handle_compare(tickers: list[str]) -> ChatResponse:
    """
    Compare deux tickers côte-à-côte sur les scores clés.
    Donne une conclusion sur lequel est plus attractif maintenant.
    """
    results = []
    for t in tickers[:2]:
        changes = get_price_changes(t)
        fundamentals = get_fundamentals(t)
        scores = compute_all_scores(fundamentals, changes)
        info = get_company_info(t)
        name = info.get("shortName") or t
        results.append({
            "ticker": t,
            "name": name,
            "scores": scores,
            "changes": changes,
        })

    if not results:
        return ChatResponse(type="error", text="Données indisponibles pour la comparaison.")

    lines = [f"## Comparaison : {' vs '.join(r['ticker'] for r in results)}\n"]

    # Table de comparaison
    headers = ["", results[0]["ticker"], results[1]["ticker"] if len(results) > 1 else "—"]
    rows = []
    metrics = [
        ("Composite", "composite", False),
        ("Qualité", "quality", True),
        ("Valorisation", "valuation", True),
        ("Croissance", "growth", True),
        ("Momentum", "momentum", True),
        ("Risque", "risk", True),
    ]

    for label, key, is_sub in metrics:
        vals = []
        for r in results:
            sc = r["scores"]
            v = sc[key]["score"] if is_sub else sc[key]
            vals.append(v)
        winner = "→" if len(vals) < 2 else ("←" if vals[0] < vals[1] else ("→" if vals[0] > vals[1] else "="))
        row = f"**{label}** | {vals[0]}/10 | {vals[1] if len(vals)>1 else '—'}/10 {winner}"
        rows.append(row)

    for r in rows:
        lines.append(r)

    # Conclusion
    if len(results) == 2:
        s1 = results[0]["scores"]["composite"]
        s2 = results[1]["scores"]["composite"]
        diff = abs(s1 - s2)
        better = results[0]["ticker"] if s1 >= s2 else results[1]["ticker"]
        worse = results[1]["ticker"] if s1 >= s2 else results[0]["ticker"]

        lines.append("")
        if diff < 0.3:
            lines.append(f"**Verdict :** Les deux sont très proches ({s1} vs {s2}). Diversifier ou choisir selon ton horizon.")
        else:
            lines.append(f"**Verdict :** **{better}** est actuellement plus attractif ({max(s1,s2)}/10 vs {min(s1,s2)}/10 pour {worse}).")

    return ChatResponse(
        type="compare",
        text="\n".join(lines),
        data={"tickers": [r["ticker"] for r in results]},
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

    # Extraire le contexte de la conversation précédente
    ctx = _extract_context(request.history)

    # Détecter si c'est une question de suivi (follow-up)
    followup = _detect_followup(message, ctx) if ctx["last_ticker"] or ctx["last_opportunities"] else None

    if followup:
        intent_data = followup
    else:
        intent_data = _detect_intent(message)

    intent = intent_data["intent"]
    ticker = intent_data.get("ticker") or request.context

    logger.info(f"Chat: intent={intent}, ticker={ticker}, followup={followup is not None}, message='{message[:50]}'")

    try:
        if intent == "compare":
            tickers = intent_data.get("tickers", [])
            if len(tickers) >= 2:
                return await _handle_compare(tickers)
        if intent == "followup_risk" and ticker:
            return await _handle_followup_risk(ticker)
        elif intent == "followup_buy" and ticker:
            return await _handle_followup_buy(ticker)
        elif intent == "analysis" and ticker:
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
            if ticker:
                return await _handle_analysis(ticker)
            return await _handle_opportunities(None)

    except Exception as e:
        logger.error(f"Erreur chatbot: {e}")
        return ChatResponse(
            type="error",
            text="Une erreur s'est produite. Réessaie ou reformule ta question.",
        )
