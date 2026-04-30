"""
Investment Analyst — Moteur de raisonnement Warren Buffett

Ce module est le coeur du système d'analyse. Il orchestre :
  1. La collecte de données depuis toutes les sources disponibles
     (yfinance, web research, SEC, Google News)
  2. La construction d'un contexte structuré et complet
  3. L'appel à Claude API pour produire une thèse d'investissement
  4. La persistance en base et le cache (7 jours)

Coût estimé : ~0.15$ par analyse (Sonnet), ~0.75$ pour la sélection hebdo (5 thèses).
Le budget mensuel est plafonné à 3$ — voir LLMUsageLog.

Règles strictes :
  - Jamais de retry automatique sur échec API
  - Jamais d'appel sans données collectées au préalable
  - Claude ne reçoit QUE des données vérifiées, jamais de prompt vide
  - Chaque source de données est isolée en try/except
"""
import json
import logging
import re
from datetime import datetime, timedelta, date
from typing import Optional

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.database import engine as async_engine, AsyncSessionLocal
from app.models import InvestmentAnalysis, WeeklySelection
from app.services.data_service import (
    get_company_info,
    get_fundamentals,
    get_price_changes,
    get_deep_profile,
    get_news,
)
from app.services.web_research import (
    fetch_google_news,
    fetch_sec_filing_summary,
    fetch_company_website_summary,
    research_competitors,
)
from app.services.llm_service import analyze_with_claude
from app.services.scoring import compute_all_scores
from app.services.scanner import SCAN_UNIVERSE, run_scan

logger = logging.getLogger(__name__)


# ─── Constantes ──────────────────────────────────────────────────────────────

CACHE_DAYS = 7
WEEKLY_TOP_SCAN = 20       # Nombre de tickers pré-filtrés par le scoring gratuit
WEEKLY_DEEP_COUNT = 5      # Nombre de thèses deep générées (budget ~0.75$)
DEFAULT_MODEL = "claude-sonnet-4-20250514"


# ─── Prompts ─────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """Tu es un analyste investissement senior. Tu gères un portefeuille de 500k€.
Tu raisonnes comme un investisseur qui met son propre argent.

RÈGLES :
- Utilise UNIQUEMENT les données fournies ci-dessous. N'invente AUCUN fait.
- Intègre les sources dans le texte : "(source: yfinance)", "(source: SEC 10-K)", "(source: Google News, LeMonde, 15/04/2026)"
- Si une section n'est pas pertinente pour cette entreprise, OMETS-LA.
- Si une section mérite plus de développement, DÉVELOPPE sans limite.
- Écris en français."""

USER_PROMPT_TEMPLATE = """Analyse {ticker} ({company_name}) en utilisant UNIQUEMENT les données ci-dessous.

══════════════════════════════════════════
DONNÉES COLLECTÉES
══════════════════════════════════════════

{data_context}

══════════════════════════════════════════
FORMAT DE RÉPONSE
══════════════════════════════════════════

Rédige une analyse structurée avec les sections PERTINENTES parmi :

1. **LE BUSINESS** — Ce que fait l'entreprise, pour qui, proposition de valeur. Ne répète pas la description corporate — explique le business comme si tu le racontais à un investisseur.

2. **L'AVANTAGE CONCURRENTIEL** — Moat, durabilité, risques d'érosion. Sois spécifique : effet réseau, coûts de switching, actifs intangibles, avantage coût.

3. **LA CHAÎNE DE VALEUR** — Dépendances fournisseurs, concentration clients, pouvoir de négociation.

4. **LA DYNAMIQUE FINANCIÈRE** — POURQUOI les marges sont à ce niveau, où va le FCF, quelle est la politique d'allocation du capital.

5. **LE MOMENTUM ACTUEL** — News récentes, achats/ventes insiders, changements de recommandation analystes.

6. **LES RISQUES CONCRETS** — Risques SPÉCIFIQUES à cette entreprise, pas génériques. Cite les faits.

7. **LA THÈSE D'INVESTISSEMENT** — Pourquoi maintenant (ou pas), scénario bull/bear avec chiffres.

OMETS les sections non pertinentes. DÉVELOPPE celles qui le méritent.

══════════════════════════════════════════
VERDICT STRUCTURÉ (OBLIGATOIRE)
══════════════════════════════════════════

À LA FIN de ton analyse, insère un bloc JSON entre les balises <!--VERDICT_JSON--> et <!--/VERDICT_JSON-->.
Ce bloc est parsé automatiquement — respecte EXACTEMENT ce format :

<!--VERDICT_JSON-->
{{"action": "buy|watch|avoid", "conviction": "faible|moyen|élevé", "horizon": "court terme|moyen terme|long terme", "ideal_entry_price": 123.45, "one_liner": "Résumé en une phrase de la thèse"}}
<!--/VERDICT_JSON-->

Règles du verdict :
- action : "buy" (acheter), "watch" (surveiller), "avoid" (éviter)
- conviction : "faible", "moyen", ou "élevé"
- horizon : "court terme" (< 3 mois), "moyen terme" (3-12 mois), "long terme" (> 1 an)
- ideal_entry_price : nombre décimal en devise locale, ou null si non applicable
- one_liner : une phrase maximum, en français"""


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _format_dict(data: dict, title: str) -> str:
    """Formate un dict en texte lisible pour le prompt."""
    if not data:
        return ""
    lines = [f"\n--- {title} ---"]
    for key, value in data.items():
        if value is not None and value != "" and value != []:
            if isinstance(value, float):
                lines.append(f"  {key}: {value:.4f}" if abs(value) < 1 else f"  {key}: {value:,.2f}")
            elif isinstance(value, dict):
                lines.append(f"  {key}:")
                for k2, v2 in value.items():
                    lines.append(f"    {k2}: {v2}")
            elif isinstance(value, list):
                lines.append(f"  {key}:")
                for item in value[:10]:  # Limiter pour ne pas exploser le contexte
                    if isinstance(item, dict):
                        lines.append(f"    - {item}")
                    else:
                        lines.append(f"    - {item}")
            else:
                lines.append(f"  {key}: {value}")
    return "\n".join(lines) if len(lines) > 1 else ""


def _format_news_list(news: list[dict], source_label: str) -> str:
    """Formate une liste de news pour le prompt."""
    if not news:
        return ""
    lines = [f"\n--- News ({source_label}) ---"]
    for n in news[:10]:
        title = n.get("title", "Sans titre")
        publisher = n.get("publisher", "")
        published = n.get("published", "")
        date_str = f" ({published[:10]})" if published else ""
        pub_str = f" — {publisher}" if publisher else ""
        lines.append(f"  • {title}{pub_str}{date_str}")
    return "\n".join(lines)


def _build_data_context(
    ticker: str,
    info: dict,
    fundamentals: dict,
    changes: dict,
    deep_profile: dict,
    news_yahoo: list[dict],
    news_google: list[dict],
    sec_data: dict | None,
    website_summary: str | None,
    competitors: dict | None,
    scores: dict,
) -> tuple[str, dict]:
    """
    Construit le contexte textuel complet et le dict des sources utilisées.
    Retourne (context_text, sources_dict).
    """
    sections: list[str] = []
    sources_used: dict[str, bool] = {}

    # ── Identité ─────────────────────────────────────────────────────────
    identity_data = {}
    if info:
        identity_data = {
            "Nom": info.get("longName") or info.get("shortName", ticker),
            "Secteur": info.get("sector"),
            "Industrie": info.get("industry"),
            "Pays": info.get("country"),
            "Devise": info.get("currency"),
            "Employés": info.get("fullTimeEmployees"),
            "Market Cap": info.get("marketCap"),
            "Site web": info.get("website"),
        }
        sources_used["yfinance_info"] = True
    if deep_profile and deep_profile.get("identity"):
        identity_data["Description"] = deep_profile["identity"].get("long_business_summary")
        sources_used["yfinance_deep_profile"] = True
    section = _format_dict(identity_data, "IDENTITÉ ENTREPRISE (source: yfinance)")
    if section:
        sections.append(section)

    # ── Fondamentaux ─────────────────────────────────────────────────────
    section = _format_dict(fundamentals, "FONDAMENTAUX (source: yfinance)")
    if section:
        sections.append(section)
        sources_used["yfinance_fundamentals"] = True

    # ── Variations de prix ───────────────────────────────────────────────
    section = _format_dict(changes, "VARIATIONS DE PRIX (source: yfinance)")
    if section:
        sections.append(section)
        sources_used["yfinance_prices"] = True

    # ── Deep profile — Ownership ─────────────────────────────────────────
    if deep_profile:
        ownership = deep_profile.get("ownership", {})
        if ownership:
            section = _format_dict(ownership, "ACTIONNARIAT (source: yfinance)")
            if section:
                sections.append(section)

        # Analyst view
        analyst = deep_profile.get("analyst_view", {})
        if analyst:
            section = _format_dict(analyst, "VUE ANALYSTES (source: yfinance)")
            if section:
                sections.append(section)

        # Earnings track
        earnings = deep_profile.get("earnings_track", [])
        if earnings:
            lines = ["\n--- HISTORIQUE EPS (source: yfinance) ---"]
            beat_streak = deep_profile.get("earnings_beat_streak", 0)
            lines.append(f"  Streak de beats consécutifs : {beat_streak}")
            for e in earnings:
                est = e.get("eps_estimate", "?")
                act = e.get("eps_actual", "?")
                surp = e.get("surprise_pct")
                surp_str = f" (surprise: {surp:+.1f}%)" if surp is not None else ""
                lines.append(f"  {e.get('quarter', '?')}: estimé={est}, réel={act}{surp_str}")
            sections.append("\n".join(lines))

        # Governance
        governance = deep_profile.get("governance", {})
        has_governance = any(v is not None for v in governance.values())
        if has_governance:
            section = _format_dict(governance, "GOUVERNANCE — risques (source: yfinance)")
            if section:
                sections.append(section)

        # Short interest
        short = deep_profile.get("short_interest", {})
        has_short = any(v is not None and v != "" for v in short.values())
        if has_short:
            section = _format_dict(short, "SHORT INTEREST (source: yfinance)")
            if section:
                sections.append(section)

        # Management / Officers
        officers = deep_profile.get("identity", {}).get("officers", [])
        if officers:
            lines = ["\n--- MANAGEMENT (source: yfinance) ---"]
            for o in officers:
                name = o.get("name", "?")
                title = o.get("title", "?")
                pay = o.get("total_pay")
                pay_str = f" — rémunération: ${pay:,.0f}" if pay else ""
                lines.append(f"  {name}, {title}{pay_str}")
            sections.append("\n".join(lines))

        # Top institutional holders
        top_inst = deep_profile.get("ownership", {}).get("top_institutional", [])
        if top_inst:
            lines = ["\n--- TOP ACTIONNAIRES INSTITUTIONNELS (source: yfinance) ---"]
            for h in top_inst[:7]:
                holder = h.get("holder", "?")
                shares = h.get("shares", 0)
                pct = h.get("pct_out")
                value = h.get("value")
                pct_str = f" ({pct*100:.1f}%)" if pct else ""
                val_str = f" — valeur: ${value:,.0f}" if value else ""
                lines.append(f"  {holder}: {shares:,} actions{pct_str}{val_str}")
            sections.append("\n".join(lines))

        # Insider transactions récentes
        insider_txns = deep_profile.get("ownership", {}).get("insider_transactions", [])
        if insider_txns:
            lines = ["\n--- TRANSACTIONS INSIDERS RÉCENTES (source: yfinance) ---"]
            for txn in insider_txns[:8]:
                insider = txn.get("insider", "?")
                relation = txn.get("relation", "")
                transaction = txn.get("transaction", "?")
                shares = txn.get("shares")
                txn_date = txn.get("date", "?")
                shares_str = f" — {shares:,} actions" if shares else ""
                rel_str = f" ({relation})" if relation else ""
                lines.append(f"  {txn_date}: {insider}{rel_str} — {transaction}{shares_str}")
            sections.append("\n".join(lines))

        # Financial statements (3 dernières années)
        financials = deep_profile.get("financials", {})
        for stmt_name, stmt_label in [
            ("income_stmt", "COMPTE DE RÉSULTAT"),
            ("balance_sheet", "BILAN"),
            ("cashflow", "FLUX DE TRÉSORERIE"),
        ]:
            stmt_data = financials.get(stmt_name, {})
            if stmt_data:
                lines = [f"\n--- {stmt_label} (source: yfinance, 3 dernières années) ---"]
                # Sélectionner les postes les plus importants pour garder le prompt compact
                key_items_map = {
                    "income_stmt": [
                        "Total Revenue", "Gross Profit", "Operating Income",
                        "Net Income", "EBITDA", "Basic EPS",
                        "Total Expenses", "Operating Expense",
                        "Research And Development", "Interest Expense",
                    ],
                    "balance_sheet": [
                        "Total Assets", "Total Liabilities Net Minority Interest",
                        "Stockholders Equity", "Total Debt", "Cash And Cash Equivalents",
                        "Net Tangible Assets", "Working Capital",
                        "Invested Capital", "Tangible Book Value",
                    ],
                    "cashflow": [
                        "Operating Cash Flow", "Free Cash Flow",
                        "Capital Expenditure", "Repurchase Of Capital Stock",
                        "Cash Dividends Paid", "Net Income From Continuing Operations",
                        "Change In Working Capital",
                    ],
                }
                key_items = key_items_map.get(stmt_name, [])
                years = sorted(stmt_data.keys(), reverse=True)
                # Header
                lines.append(f"  {'Poste':<45} " + "  ".join(f"{y:>14}" for y in years))
                lines.append(f"  {'─'*45} " + "  ".join(f"{'─'*14}" for _ in years))
                # Rows — priorité aux postes clés, puis les autres
                shown = set()
                for item in key_items:
                    values = []
                    has_any = False
                    for y in years:
                        val = stmt_data[y].get(item)
                        if val is not None:
                            has_any = True
                            if abs(val) >= 1_000_000_000:
                                values.append(f"{val/1e9:>13.1f}B")
                            elif abs(val) >= 1_000_000:
                                values.append(f"{val/1e6:>13.0f}M")
                            else:
                                values.append(f"{val:>14,.0f}")
                        else:
                            values.append(f"{'—':>14}")
                    if has_any:
                        lines.append(f"  {item:<45} " + "  ".join(values))
                        shown.add(item)
                sections.append("\n".join(lines))
                sources_used[f"yfinance_{stmt_name}"] = True

    # ── Concurrents ──────────────────────────────────────────────────────
    if competitors:
        if isinstance(competitors, list) and competitors:
            lines = ["\n--- COMPARAISON CONCURRENTS (source: SCAN_UNIVERSE + yfinance) ---"]
            for comp in competitors:
                name = comp.get("name", comp.get("ticker", "?"))
                ticker_c = comp.get("ticker", "?")
                price = comp.get("current_price")
                pe = comp.get("pe_ratio")
                margin = comp.get("operating_margin")
                growth = comp.get("revenue_growth")
                lines.append(f"  {ticker_c} ({name}):")
                if price is not None:
                    lines.append(f"    Prix: {price:.2f}")
                if pe is not None:
                    lines.append(f"    P/E: {pe:.1f}")
                if margin is not None:
                    lines.append(f"    Marge opé: {margin*100:.1f}%")
                if growth is not None:
                    lines.append(f"    Croissance CA: {growth*100:.1f}%")
            sections.append("\n".join(lines))
            sources_used["web_competitors"] = True
        elif isinstance(competitors, dict):
            section = _format_dict(competitors, "COMPARAISON CONCURRENTS (source: web research)")
            if section:
                sections.append(section)
                sources_used["web_competitors"] = True

    # ── News Yahoo ───────────────────────────────────────────────────────
    section = _format_news_list(news_yahoo, "Yahoo Finance")
    if section:
        sections.append(section)
        sources_used["yahoo_news"] = True

    # ── News Google ──────────────────────────────────────────────────────
    section = _format_news_list(news_google, "Google News")
    if section:
        sections.append(section)
        sources_used["google_news"] = True

    # ── SEC filings ──────────────────────────────────────────────────────
    if sec_data:
        if isinstance(sec_data, list) and sec_data:
            lines = ["\n--- SEC FILINGS (source: SEC EDGAR) ---"]
            for filing in sec_data[:10]:
                f_type = filing.get("filing_type", "?")
                f_date = filing.get("date", "?")
                f_desc = filing.get("description", "")
                lines.append(f"  {f_date} — {f_type} : {f_desc}")
            sections.append("\n".join(lines))
            sources_used["sec_edgar"] = True
        elif isinstance(sec_data, dict):
            section = _format_dict(sec_data, "SEC FILINGS (source: SEC EDGAR)")
            if section:
                sections.append(section)
                sources_used["sec_edgar"] = True

    # ── Website summary ──────────────────────────────────────────────────
    if website_summary:
        sections.append(f"\n--- RÉSUMÉ SITE CORPORATE (source: site web) ---\n  {website_summary}")
        sources_used["corporate_website"] = True

    # ── Scores rule-based ────────────────────────────────────────────────
    if scores:
        score_lines = ["\n--- SCORES QUANTITATIFS (source: scoring rule-based) ---"]
        for axis in ["quality", "valuation", "growth", "momentum", "risk"]:
            axis_data = scores.get(axis, {})
            if isinstance(axis_data, dict):
                score_val = axis_data.get("score", "?")
                score_lines.append(f"  {axis}: {score_val}/10")
                reasons = axis_data.get("reasons", [])
                for r in reasons[:5]:
                    score_lines.append(f"    → {r}")
        composite = scores.get("composite", "?")
        score_lines.append(f"  COMPOSITE: {composite}/10")
        sections.append("\n".join(score_lines))
        sources_used["scoring_rule_based"] = True

    context = "\n".join(sections) if sections else "(Aucune donnée disponible)"
    return context, sources_used


def _parse_verdict(analysis_text: str) -> dict:
    """
    Extrait le verdict structuré depuis le texte de Claude.

    Stratégie en 2 passes :
      1. Cherche le bloc JSON entre <!--VERDICT_JSON--> balises (fiable)
      2. Fallback regex sur le texte libre (best-effort)

    Retourne un dict avec action, conviction, horizon, ideal_entry_price, one_liner.
    """
    defaults = {
        "verdict_action": "watch",
        "verdict_conviction": "moyen",
        "verdict_horizon": None,
        "ideal_entry_price": None,
        "one_liner": None,
    }

    # ── Passe 1 : JSON structuré (fiable) ────────────────────────────────
    json_match = re.search(
        r"<!--VERDICT_JSON-->\s*(\{.*?\})\s*<!--/VERDICT_JSON-->",
        analysis_text,
        re.DOTALL,
    )
    if json_match:
        try:
            verdict_data = json.loads(json_match.group(1))

            # Normaliser action
            action_raw = str(verdict_data.get("action", "watch")).lower().strip()
            action_map = {
                "buy": "buy", "acheter": "buy", "achat": "buy",
                "watch": "watch", "surveiller": "watch",
                "avoid": "avoid", "éviter": "avoid", "eviter": "avoid",
            }
            defaults["verdict_action"] = action_map.get(action_raw, "watch")

            # Normaliser conviction
            conviction_raw = str(verdict_data.get("conviction", "moyen")).lower().strip()
            conviction_map = {
                "faible": "faible", "low": "faible",
                "moyen": "moyen", "medium": "moyen", "modéré": "moyen",
                "élevé": "élevé", "elevé": "élevé", "eleve": "élevé",
                "high": "élevé", "fort": "élevé",
            }
            defaults["verdict_conviction"] = conviction_map.get(conviction_raw, "moyen")

            # Horizon
            horizon = verdict_data.get("horizon")
            if horizon:
                defaults["verdict_horizon"] = str(horizon).strip()

            # Prix d'entrée
            price = verdict_data.get("ideal_entry_price")
            if price is not None and price != "null" and price != "N/A":
                try:
                    defaults["ideal_entry_price"] = float(price)
                except (ValueError, TypeError):
                    pass

            # One-liner
            one_liner = verdict_data.get("one_liner")
            if one_liner:
                defaults["one_liner"] = str(one_liner).strip()

            logger.info(f"Verdict JSON parsé : action={defaults['verdict_action']}, conviction={defaults['verdict_conviction']}")
            return defaults

        except (json.JSONDecodeError, KeyError, TypeError) as e:
            logger.warning(f"Verdict JSON invalide, fallback regex : {e}")

    # ── Passe 2 : Fallback regex (best-effort) ──────────────────────────
    logger.warning("Pas de bloc VERDICT_JSON trouvé, tentative regex")
    text_lower = analysis_text.lower()

    # Chercher la section "Verdict" pour un parsing plus ciblé
    verdict_section = ""
    verdict_match = re.search(
        r"(?:^|\n)\s*(?:\*\*)?verdict(?:\*\*)?[\s.:—–-]*(.*?)(?=\n\s*(?:#+|\*\*|classement|$))",
        text_lower, re.DOTALL
    )
    if verdict_match:
        verdict_section = verdict_match.group(1)

    # Zone de recherche : verdict section d'abord, sinon tout le texte
    search_zone = verdict_section if verdict_section else text_lower

    # Action : ACHETER/BUY/SURVEILLER/WATCH/ÉVITER/AVOID
    action_match = re.search(
        r"(acheter|achat|buy)\b", search_zone
    )
    if action_match:
        defaults["verdict_action"] = "buy"
    elif re.search(r"(surveiller|watch)\b", search_zone):
        defaults["verdict_action"] = "watch"
    elif re.search(r"(éviter|eviter|avoid)\b", search_zone):
        defaults["verdict_action"] = "avoid"

    # Conviction : chercher "conviction X" ou "conviction : X"
    conviction_match = re.search(
        r"conviction\s*[:\s—–-]*\s*(faible|moyen(?:ne)?|élevé|elevé|fort|modéré|haute|basse)",
        search_zone
    )
    if not conviction_match:
        conviction_match = re.search(
            r"conviction\s*[:\s—–-]*\s*(faible|moyen(?:ne)?|élevé|elevé|fort|modéré|haute|basse)",
            text_lower
        )
    if conviction_match:
        raw = conviction_match.group(1)
        conviction_map = {
            "faible": "faible", "basse": "faible",
            "moyen": "moyen", "moyenne": "moyen", "modéré": "moyen",
            "élevé": "élevé", "elevé": "élevé", "fort": "élevé", "haute": "élevé",
        }
        defaults["verdict_conviction"] = conviction_map.get(raw, "moyen")

    # Horizon
    horizon_match = re.search(r"horizon\s*[:\s—–-]*\s*(court\s*terme|moyen\s*terme|long\s*terme)", text_lower)
    if horizon_match:
        defaults["verdict_horizon"] = horizon_match.group(1).strip()

    # Prix d'entrée : "Prix d'entrée : 360-375 $" ou "Entrée : 185-200 $"
    price_match = re.search(
        r"(?:prix\s*d['''\s]entrée|entrée)\s*(?:idéal[e]?)?\s*[:\s—–-]*\s*~?\s*\$?\s*(\d+[\.,]?\d*)",
        text_lower
    )
    if price_match:
        try:
            defaults["ideal_entry_price"] = float(price_match.group(1).replace(",", "."))
        except ValueError:
            pass

    # One-liner : extraire la première phrase du verdict
    if verdict_section:
        # Prendre tout jusqu'au premier point suivi d'un espace
        one_liner_match = re.match(r"\s*(.+?\.)\s", verdict_section)
        if one_liner_match:
            one_liner = one_liner_match.group(1).strip()
            # Nettoyer le formatage markdown
            one_liner = re.sub(r"\*\*", "", one_liner)
            if len(one_liner) > 10:
                defaults["one_liner"] = one_liner[:200]

    logger.info(f"Verdict regex: action={defaults['verdict_action']}, conviction={defaults['verdict_conviction']}, price={defaults['ideal_entry_price']}")
    return defaults


def _extract_weekly_sections(text: str) -> dict[str, Optional[str]]:
    """
    Extraire les sections d'une analyse hebdo.
    Gère deux formats :
      1. Markdown classique : ## LE BUSINESS / **LE BUSINESS** —
      2. Prose inline : "Thèse d'investissement. contenu..." / "Momentum. contenu..."
    """
    result = {
        "business_summary": None,
        "competitive_moat": None,
        "value_chain": None,
        "financial_dynamics": None,
        "current_momentum": None,
        "specific_risks": None,
        "investment_thesis": None,
    }

    # Stratégie 1 : headings markdown standard
    heading_map = {
        "business_summary": ["LE BUSINESS", "POURQUOI CETTE ENTREPRISE", "THÈSE D'INVESTISSEMENT"],
        "competitive_moat": ["L'AVANTAGE CONCURRENTIEL", "MOAT"],
        "value_chain": ["LA CHAÎNE DE VALEUR"],
        "financial_dynamics": ["LA DYNAMIQUE FINANCIÈRE"],
        "current_momentum": ["LE MOMENTUM ACTUEL", "LE MOMENTUM", "MOMENTUM"],
        "specific_risks": ["LES RISQUES CONCRETS", "LES RISQUES", "RISQUES SPÉCIFIQUES", "RISQUES"],
        "investment_thesis": ["LA THÈSE D'INVESTISSEMENT", "VERDICT"],
    }

    for key, headings in heading_map.items():
        for heading in headings:
            content = _extract_section(text, heading)
            if content:
                result[key] = content
                break

    # Vérifier si on a trouvé au moins quelques sections
    found = sum(1 for v in result.values() if v)
    if found >= 2:
        return result

    # Stratégie 2 : format prose inline ("Thèse d'investissement. contenu...")
    # Pattern : mot(s) suivi d'un point, puis le contenu jusqu'au prochain heading similaire
    prose_patterns = {
        "business_summary": r"(?:thèse d'investissement|these d'investissement|pourquoi cette entreprise)\.\s*(.+?)(?=\n(?:momentum|risques? spécifiques?|verdict)\.|$)",
        "current_momentum": r"(?:momentum)\.\s*(.+?)(?=\n(?:risques? spécifiques?|verdict)\.|$)",
        "specific_risks": r"(?:risques? spécifiques?|risques?)\.\s*(.+?)(?=\n(?:verdict)\.|$)",
        "investment_thesis": r"(?:verdict)\.\s*(.+?)(?=\n\n|\n(?:[A-Z]{2,})|$)",
    }

    for key, pattern in prose_patterns.items():
        if result[key]:
            continue  # Déjà trouvé par la stratégie 1
        match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
        if match:
            result[key] = match.group(1).strip()

    # Si toujours rien de trouvé, mettre tout le texte dans investment_thesis
    found = sum(1 for v in result.values() if v)
    if found == 0:
        # Prendre le texte après la première ligne (qui est le titre ticker)
        lines = text.split("\n", 1)
        result["investment_thesis"] = lines[1].strip() if len(lines) > 1 else text

    return result


def _extract_section(text: str, heading: str) -> Optional[str]:
    """
    Extrait le contenu d'une section markdown depuis le texte d'analyse.

    Gère les variantes de formatage :
      - ## LE BUSINESS            (markdown h2)
      - **LE BUSINESS**           (gras markdown)
      - 1. **LE BUSINESS** —      (numéroté + gras + tiret)
      - ### Le Business :         (h3 + deux-points)
      - **1. LE BUSINESS**        (gras englobant le numéro)

    Capture jusqu'au prochain heading de même format ou fin du texte.
    """
    # Construire un pattern flexible pour le heading
    # Ex: "LE BUSINESS" → matche "le business", "Le Business", "LE BUSINESS"
    heading_words = heading.lower().split()
    heading_pattern = r"\s+".join(re.escape(w) for w in heading_words)

    # Cherche le heading sous toutes ses formes
    pattern = re.compile(
        rf"(?:^|\n)\s*"
        rf"(?:#+\s+)?"              # Optionnel: ## ou ###
        rf"(?:\*\*)?"               # Optionnel: **
        rf"(?:\d+\.\s*)?"          # Optionnel: 1.
        rf"(?:\*\*)?"               # Optionnel: ** (après le numéro)
        rf"{heading_pattern}"       # Le heading lui-même
        rf"(?:\*\*)?"               # Optionnel: ** fermant
        rf"\s*(?:—|:|–|\n)"        # Séparateur
        rf"(.*?)"                   # CONTENU (capturé)
        rf"(?="                     # Lookahead: prochain heading ou fin
        rf"\n\s*(?:#+\s+|\*\*|\d+\.\s*\*\*)"  # Prochain heading markdown
        rf"|$"
        rf")",
        re.IGNORECASE | re.DOTALL,
    )
    match = pattern.search(text)
    if match:
        content = match.group(1).strip()
        # Nettoyer les ** résiduels en début/fin
        content = re.sub(r"^\*\*\s*", "", content)
        content = re.sub(r"\s*\*\*$", "", content)
        return content if content and len(content) > 10 else None
    return None


# ─── Fonctions principales ───────────────────────────────────────────────────

async def generate_investment_thesis(ticker: str) -> dict:
    """
    Génère une thèse d'investissement complète pour un ticker.

    Process :
      1. Collecte de données depuis toutes les sources (chaque appel isolé)
      2. Construction du contexte structuré
      3. Appel Claude API (Sonnet)
      4. Parsing du verdict
      5. Sauvegarde en DB avec cache 7 jours
      6. Retour du résultat complet

    Retourne un dict avec toutes les sections + métadonnées.
    Lève une exception si l'appel Claude échoue (pas de retry).
    """
    ticker = ticker.upper()
    logger.info(f"Génération thèse d'investissement pour {ticker}")

    # ── Step 1 : Collecte de données ─────────────────────────────────────
    info: dict = {}
    try:
        info = get_company_info(ticker)
    except Exception as e:
        logger.error(f"[{ticker}] Erreur get_company_info: {e}")

    fundamentals: dict = {}
    try:
        fundamentals = get_fundamentals(ticker)
    except Exception as e:
        logger.error(f"[{ticker}] Erreur get_fundamentals: {e}")

    changes: dict = {}
    try:
        changes = get_price_changes(ticker)
    except Exception as e:
        logger.error(f"[{ticker}] Erreur get_price_changes: {e}")

    deep_profile: dict = {}
    try:
        deep_profile = get_deep_profile(ticker)
    except Exception as e:
        logger.error(f"[{ticker}] Erreur get_deep_profile: {e}")

    news_yahoo: list[dict] = []
    try:
        news_yahoo = get_news(ticker, count=10)
    except Exception as e:
        logger.error(f"[{ticker}] Erreur get_news: {e}")

    company_name = info.get("longName") or info.get("shortName", ticker)

    news_google: list[dict] = []
    try:
        news_google = fetch_google_news(f'"{company_name}" stock')
    except Exception as e:
        logger.error(f"[{ticker}] Erreur fetch_google_news: {e}")

    sec_data: dict | None = None
    try:
        sec_data = fetch_sec_filing_summary(ticker)
    except Exception as e:
        logger.error(f"[{ticker}] Erreur fetch_sec_filing_summary: {e}")

    website_summary: str | None = None
    try:
        website_url = info.get("website", "")
        if website_url:
            website_summary = fetch_company_website_summary(website_url)
    except Exception as e:
        logger.error(f"[{ticker}] Erreur fetch_company_website_summary: {e}")

    competitors: dict | None = None
    try:
        competitors = research_competitors(ticker, info.get("sector", ""))
    except Exception as e:
        logger.error(f"[{ticker}] Erreur research_competitors: {e}")

    scores: dict = {}
    try:
        scores = compute_all_scores(fundamentals, changes)
    except Exception as e:
        logger.error(f"[{ticker}] Erreur compute_all_scores: {e}")

    # ── Step 2 : Construction du contexte ────────────────────────────────
    data_context, sources_used = _build_data_context(
        ticker=ticker,
        info=info,
        fundamentals=fundamentals,
        changes=changes,
        deep_profile=deep_profile,
        news_yahoo=news_yahoo,
        news_google=news_google,
        sec_data=sec_data,
        website_summary=website_summary,
        competitors=competitors,
        scores=scores,
    )

    # ── Step 3 + 4 : Prompt et appel Claude ──────────────────────────────
    user_prompt = USER_PROMPT_TEMPLATE.format(
        ticker=ticker,
        company_name=company_name,
        data_context=data_context,
    )

    logger.info(f"[{ticker}] Appel Claude API — contexte: {len(data_context)} caractères")

    llm_response = await analyze_with_claude(
        system_prompt=SYSTEM_PROMPT,
        user_content=user_prompt,
        purpose="deep_analysis",
        ticker=ticker,
        model=DEFAULT_MODEL,
        max_tokens=4096,
    )

    analysis_text: str = llm_response["content"]
    input_tokens: int = llm_response.get("input_tokens", 0)
    output_tokens: int = llm_response.get("output_tokens", 0)
    cost_usd: float = llm_response.get("cost_usd", 0.0)

    logger.info(
        f"[{ticker}] Analyse générée — {input_tokens} in / {output_tokens} out — ${cost_usd:.4f}"
    )

    # ── Step 5 : Parsing du verdict ──────────────────────────────────────
    verdict = _parse_verdict(analysis_text)

    # Extraction des sections (best-effort, le texte complet reste dans investment_thesis)
    sections = {
        "business_summary": _extract_section(analysis_text, "LE BUSINESS"),
        "competitive_moat": _extract_section(analysis_text, "L'AVANTAGE CONCURRENTIEL"),
        "value_chain": _extract_section(analysis_text, "LA CHAÎNE DE VALEUR"),
        "financial_dynamics": _extract_section(analysis_text, "LA DYNAMIQUE FINANCIÈRE"),
        "current_momentum": _extract_section(analysis_text, "LE MOMENTUM ACTUEL"),
        "specific_risks": _extract_section(analysis_text, "LES RISQUES CONCRETS"),
        "investment_thesis": _extract_section(analysis_text, "LA THÈSE D'INVESTISSEMENT"),
    }

    # ── Step 6 : Sauvegarde en DB ────────────────────────────────────────
    now = datetime.utcnow()
    analysis = InvestmentAnalysis(
        ticker=ticker,
        business_summary=sections["business_summary"],
        competitive_moat=sections["competitive_moat"],
        value_chain=sections["value_chain"],
        financial_dynamics=sections["financial_dynamics"],
        current_momentum=sections["current_momentum"],
        specific_risks=sections["specific_risks"],
        investment_thesis=sections["investment_thesis"] or analysis_text,
        verdict_action=verdict["verdict_action"],
        verdict_conviction=verdict["verdict_conviction"],
        verdict_horizon=verdict["verdict_horizon"],
        ideal_entry_price=verdict["ideal_entry_price"],
        one_liner=verdict.get("one_liner"),
        data_sources=json.dumps(sources_used, ensure_ascii=False),
        llm_model=DEFAULT_MODEL,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=cost_usd,
        generated_at=now,
        expires_at=now + timedelta(days=CACHE_DAYS),
    )

    async with AsyncSessionLocal() as session:
        session.add(analysis)
        await session.commit()
        await session.refresh(analysis)

    logger.info(f"[{ticker}] Analyse sauvegardée (id={analysis.id}, action={verdict['verdict_action']})")

    # ── Step 7 : Retour ──────────────────────────────────────────────────
    return {
        "id": analysis.id,
        "ticker": ticker,
        "company_name": company_name,
        "business_summary": sections["business_summary"],
        "competitive_moat": sections["competitive_moat"],
        "value_chain": sections["value_chain"],
        "financial_dynamics": sections["financial_dynamics"],
        "current_momentum": sections["current_momentum"],
        "specific_risks": sections["specific_risks"],
        "investment_thesis": sections["investment_thesis"] or analysis_text,
        "full_analysis": analysis_text,
        "verdict_action": verdict["verdict_action"],
        "verdict_conviction": verdict["verdict_conviction"],
        "verdict_horizon": verdict["verdict_horizon"],
        "ideal_entry_price": verdict["ideal_entry_price"],
        "one_liner": verdict.get("one_liner"),
        "data_sources": sources_used,
        "scores": scores,
        "llm_model": DEFAULT_MODEL,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_usd": cost_usd,
        "generated_at": now.isoformat(),
        "expires_at": (now + timedelta(days=CACHE_DAYS)).isoformat(),
    }


async def generate_prompt_for_clipboard(ticker: str) -> dict:
    """
    Génère le prompt complet prêt à copier-coller dans claude.ai.

    Collecte les données gratuites (yfinance, Google News, SEC, concurrents),
    les intègre dans le prompt, et ajoute des instructions pour que Claude
    complète avec sa propre recherche web.

    Retourne {"prompt": str, "data_sources": dict, "char_count": int}.
    Coût : 0€ (aucun appel API).
    """
    ticker = ticker.upper()
    logger.info(f"Génération prompt clipboard pour {ticker}")

    # ── Collecte gratuite (identique à generate_investment_thesis) ────────
    info: dict = {}
    try:
        info = get_company_info(ticker)
    except Exception:
        pass

    fundamentals: dict = {}
    try:
        fundamentals = get_fundamentals(ticker)
    except Exception:
        pass

    changes: dict = {}
    try:
        changes = get_price_changes(ticker)
    except Exception:
        pass

    deep_profile: dict = {}
    try:
        deep_profile = get_deep_profile(ticker)
    except Exception:
        pass

    news_yahoo: list[dict] = []
    try:
        news_yahoo = get_news(ticker, count=10)
    except Exception:
        pass

    company_name = info.get("longName") or info.get("shortName", ticker)

    news_google: list[dict] = []
    try:
        news_google = fetch_google_news(f'"{company_name}" stock')
    except Exception:
        pass

    sec_data = None
    try:
        sec_data = fetch_sec_filing_summary(ticker)
    except Exception:
        pass

    competitors = None
    try:
        competitors = research_competitors(ticker, info.get("sector", ""))
    except Exception:
        pass

    website_summary = None
    try:
        website_url = info.get("website", "")
        if website_url:
            website_summary = fetch_company_website_summary(website_url)
    except Exception:
        pass

    scores: dict = {}
    try:
        scores = compute_all_scores(fundamentals, changes)
    except Exception:
        pass

    # Contexte macro (gratuit, déjà dans scanner.py)
    macro_context = ""
    try:
        from app.services.scanner import run_macro_scan
        macro = run_macro_scan()
        if macro:
            macro_lines = ["\n--- CONTEXTE MACRO (source: yfinance ETFs/indices) ---"]
            macro_lines.append(f"  Régime : {macro.get('risk_regime', '?')} (VIX: {macro.get('vix', '?')})")
            for name, data in macro.get("macro", {}).items():
                price = data.get("price")
                chg = data.get("change_1d")
                ytd = data.get("change_ytd")
                macro_lines.append(f"  {name}: {price:,.1f}  1J: {chg:+.2f}%  YTD: {ytd:+.1f}%" if price and chg is not None and ytd is not None else f"  {name}: données partielles")
            if macro.get("outperformers"):
                macro_lines.append("  Secteurs en surperformance YTD :")
                for s in macro["outperformers"][:3]:
                    macro_lines.append(f"    ↑ {s['sector']} (+{s['outperformance']:.1f}% vs SP500)")
            if macro.get("underperformers"):
                macro_lines.append("  Secteurs en sous-performance YTD :")
                for s in macro["underperformers"][:3]:
                    macro_lines.append(f"    ↓ {s['sector']} ({s['underperformance']:.1f}% vs SP500)")
            macro_context = "\n".join(macro_lines)
    except Exception:
        pass

    # ── Construction du contexte ─────────────────────────────────────────
    data_context, sources_used = _build_data_context(
        ticker=ticker,
        info=info,
        fundamentals=fundamentals,
        changes=changes,
        deep_profile=deep_profile,
        news_yahoo=news_yahoo,
        news_google=news_google,
        sec_data=sec_data,
        website_summary=website_summary,
        competitors=competitors,
        scores=scores,
    )

    # Ajouter le contexte macro
    if macro_context:
        data_context = macro_context + "\n" + data_context
        sources_used["macro_context"] = True

    # ── Prompt spécial clipboard ─────────────────────────────────────────
    prompt = f"""Tu es un analyste investissement senior. Tu gères un portefeuille de 500k€.
Tu raisonnes comme un investisseur qui met son propre argent.

Je te demande d'analyser **{ticker} ({company_name})** pour décider si j'investirais.

══════════════════════════════════════════
DONNÉES DÉJÀ COLLECTÉES (source: yfinance + Google News + SEC EDGAR + macro + site corporate)
══════════════════════════════════════════
{data_context}

══════════════════════════════════════════
RECHERCHE COMPLÉMENTAIRE — À TOI DE JOUER
══════════════════════════════════════════

Les données ci-dessus viennent de sources gratuites. Elles couvrent : fondamentaux, prix, management, actionnariat institutionnel, transactions insiders, états financiers 3 ans, earnings history, recommandations analystes, governance, short interest, news Yahoo+Google, filings SEC, contexte macro, site corporate.

Pour COMPLÉTER, recherche toi-même ce qui manque :

1. **Derniers earnings call** — que dit le management sur la guidance, les tendances, les risques ?
2. **Actualités récentes** — news des 15 derniers jours que les flux RSS auraient pu manquer
3. **Environnement concurrentiel actuel** — qui gagne/perd des parts de marché en ce moment ?
4. **Risques réglementaires en cours** — enquêtes, procès, nouvelles régulations
5. **Site investisseurs** — {info.get('website', 'cherche-le')}/investor-relations — dernière présentation, guidance chiffrée
6. **Consensus analystes** — dernières notes de brokers, changements de target récents

Cite tes sources dans le texte : "(source: Reuters, 15/04/2026)", "(source: 10-K 2024)", etc.

══════════════════════════════════════════
FORMAT DE RÉPONSE
══════════════════════════════════════════

Rédige une analyse structurée en français. Sections FLEXIBLES — omets celles qui ne sont pas pertinentes, développe celles qui le méritent :

1. **LE BUSINESS** — Ce que fait l'entreprise, pour qui, proposition de valeur unique. Pas la description Wikipedia — explique le business comme si tu le racontais à un investisseur.

2. **L'AVANTAGE CONCURRENTIEL** — Moat, durabilité, risques d'érosion. Effet réseau, coûts de switching, actifs intangibles, avantage coût — sois spécifique.

3. **LA CHAÎNE DE VALEUR** — Fournisseurs critiques, concentration clients, pouvoir de négociation amont/aval.

4. **LA DYNAMIQUE FINANCIÈRE** — POURQUOI les marges sont à ce niveau, où va le FCF, politique d'allocation du capital (buybacks, R&D, dette, acquisitions).

5. **LE MOMENTUM ACTUEL** — News récentes, achats/ventes insiders, changements de recommandation analystes, catalyseurs court terme.

6. **LES RISQUES CONCRETS** — Risques SPÉCIFIQUES à cette entreprise, pas génériques. DMA européen, dépendance TSMC, concentration revenus, etc.

7. **LA THÈSE D'INVESTISSEMENT** — Pourquoi maintenant (ou pas). Scénario bull avec chiffres. Scénario bear avec chiffres. Qu'est-ce qui invaliderait la thèse.

8. **VERDICT** :
   - Action : ACHETER / SURVEILLER / ÉVITER
   - Conviction : faible / moyen / élevé
   - Horizon : court terme / moyen terme / long terme
   - Prix d'entrée idéal estimé
   - Résumé en une phrase

Intègre les chiffres et les sources dans le texte. Pas de tableaux de ratios séparés — du raisonnement, pas du reporting."""

    return {
        "ticker": ticker,
        "company_name": company_name,
        "prompt": prompt,
        "data_sources": sources_used,
        "char_count": len(prompt),
        "estimated_tokens": len(prompt) // 4,
    }


async def generate_weekly_prompt_for_clipboard() -> dict:
    """
    Génère un prompt copier-coller pour la sélection hebdomadaire.

    Process :
      1. Scan gratuit (scoring rule-based) → top 5
      2. Pour chaque ticker : collecte données yfinance + news
      3. Construction d'un seul prompt multi-tickers

    Retourne {"prompt": str, "tickers": list, "char_count": int}.
    Coût : 0€.
    """
    logger.info("Génération prompt hebdo clipboard")

    # ── Étape 1 : Screening gratuit ──────────────────────────────────────
    scan_results = run_scan(max_results=WEEKLY_TOP_SCAN)
    if not scan_results:
        return {
            "prompt": "Aucune opportunité détectée par le scanner cette semaine.",
            "tickers": [],
            "char_count": 0,
            "estimated_tokens": 0,
        }

    top_candidates = scan_results[:WEEKLY_DEEP_COUNT]
    top_tickers = [c["ticker"] for c in top_candidates]
    logger.info(f"Prompt hebdo: top {len(top_tickers)} = {top_tickers}")

    # ── Étape 2 : Collecte pour chaque ticker ────────────────────────────
    all_contexts: list[str] = []
    all_sources: dict[str, bool] = {}

    for candidate in top_candidates:
        ticker = candidate["ticker"]
        info: dict = {}
        try:
            info = get_company_info(ticker)
        except Exception:
            pass

        fundamentals: dict = {}
        try:
            fundamentals = get_fundamentals(ticker)
        except Exception:
            pass

        changes: dict = {}
        try:
            changes = get_price_changes(ticker)
        except Exception:
            pass

        deep_profile: dict = {}
        try:
            deep_profile = get_deep_profile(ticker)
        except Exception:
            pass

        news_yahoo: list[dict] = []
        try:
            news_yahoo = get_news(ticker, count=5)
        except Exception:
            pass

        company_name = info.get("longName") or info.get("shortName", ticker)

        news_google: list[dict] = []
        try:
            news_google = fetch_google_news(f'"{company_name}" stock', max_results=5)
        except Exception:
            pass

        scores: dict = {}
        try:
            scores = compute_all_scores(fundamentals, changes)
        except Exception:
            pass

        data_context, sources = _build_data_context(
            ticker=ticker,
            info=info,
            fundamentals=fundamentals,
            changes=changes,
            deep_profile=deep_profile,
            news_yahoo=news_yahoo,
            news_google=news_google,
            sec_data=None,  # skip SEC pour garder le prompt compact
            website_summary=None,
            competitors=None,  # skip concurrents par ticker, la comparaison est globale
            scores=scores,
        )

        composite = candidate.get("scores", {}).get("composite", "?")
        signal = candidate.get("signal_type", "?")
        all_contexts.append(
            f"\n{'='*60}\n"
            f"TICKER #{len(all_contexts)+1} : {ticker} ({company_name}) — Score: {composite}/10, Signal: {signal}\n"
            f"{'='*60}\n"
            f"{data_context}"
        )
        all_sources.update(sources)

    # ── Étape 3 : Prompt multi-tickers ───────────────────────────────────
    merged_context = "\n".join(all_contexts)

    prompt = f"""Tu es un analyste investissement senior. Tu gères un portefeuille de 500k€.
Tu raisonnes comme un investisseur qui met son propre argent.

Je te demande de faire la **sélection hebdomadaire** parmi les {len(top_tickers)} meilleures opportunités détectées par mon scanner quantitatif.

Les tickers ci-dessous ont été pré-filtrés sur ~130 actions par un scoring automatique (qualité, valorisation, croissance, momentum, risque). Tu reçois les données brutes de chaque candidat.

══════════════════════════════════════════
CANDIDATS PRÉ-SÉLECTIONNÉS ({len(top_tickers)} tickers)
══════════════════════════════════════════
{merged_context}

══════════════════════════════════════════
RECHERCHE COMPLÉMENTAIRE — À TOI DE JOUER
══════════════════════════════════════════

Pour CHAQUE ticker, recherche toi-même :
1. Actualités récentes (30 derniers jours)
2. Catalyseurs court terme (earnings, produits, réglementation)
3. Environnement concurrentiel
4. Risques spécifiques

Cite tes sources : "(source: Reuters, 15/04/2026)", etc.

══════════════════════════════════════════
FORMAT DE RÉPONSE
══════════════════════════════════════════

Pour chaque ticker, rédige une analyse CONCISE mais PROFONDE (pas de ratios recopiés, du raisonnement) :

1. **Pourquoi cette entreprise** — en 3-5 phrases : le business, le moat, pourquoi elle et pas une autre
2. **Le momentum** — ce qui se passe maintenant, catalyseurs
3. **Les risques** — spécifiques, pas génériques
4. **Verdict** : ACHETER / SURVEILLER / ÉVITER + conviction (faible/moyen/élevé) + prix d'entrée idéal

Puis à la fin, fais un **CLASSEMENT FINAL** :
- Classe les {len(top_tickers)} tickers du plus intéressant au moins intéressant
- Explique POURQUOI tu les classes dans cet ordre
- Indique clairement lequel tu achèterais EN PREMIER si tu devais choisir un seul

Écris en français. Intègre les chiffres et sources dans le texte."""

    return {
        "tickers": top_tickers,
        "scan_count": len(scan_results),
        "prompt": prompt,
        "data_sources": all_sources,
        "char_count": len(prompt),
        "estimated_tokens": len(prompt) // 4,
    }


async def import_pasted_analysis(ticker: str, analysis_text: str) -> dict:
    """
    Importe une analyse copiée-collée depuis claude.ai.
    Parse le verdict et les sections, stocke en DB comme une InvestmentAnalysis.
    """
    ticker = ticker.upper()
    logger.info(f"Import analyse collée pour {ticker} ({len(analysis_text)} chars)")

    verdict = _parse_verdict(analysis_text)

    sections = {
        "business_summary": _extract_section(analysis_text, "LE BUSINESS"),
        "competitive_moat": _extract_section(analysis_text, "L'AVANTAGE CONCURRENTIEL"),
        "value_chain": _extract_section(analysis_text, "LA CHAÎNE DE VALEUR"),
        "financial_dynamics": _extract_section(analysis_text, "LA DYNAMIQUE FINANCIÈRE"),
        "current_momentum": _extract_section(analysis_text, "LE MOMENTUM ACTUEL"),
        "specific_risks": _extract_section(analysis_text, "LES RISQUES CONCRETS"),
        "investment_thesis": _extract_section(analysis_text, "LA THÈSE D'INVESTISSEMENT"),
    }

    now = datetime.utcnow()
    analysis = InvestmentAnalysis(
        ticker=ticker,
        business_summary=sections["business_summary"],
        competitive_moat=sections["competitive_moat"],
        value_chain=sections["value_chain"],
        financial_dynamics=sections["financial_dynamics"],
        current_momentum=sections["current_momentum"],
        specific_risks=sections["specific_risks"],
        investment_thesis=sections["investment_thesis"] or analysis_text,
        verdict_action=verdict["verdict_action"],
        verdict_conviction=verdict["verdict_conviction"],
        verdict_horizon=verdict["verdict_horizon"],
        ideal_entry_price=verdict["ideal_entry_price"],
        one_liner=verdict.get("one_liner"),
        data_sources=json.dumps({"source": "claude.ai_paste"}, ensure_ascii=False),
        llm_model="claude.ai (copier-coller)",
        input_tokens=0,
        output_tokens=0,
        cost_usd=0.0,
        generated_at=now,
        expires_at=now + timedelta(days=CACHE_DAYS),
    )

    async with AsyncSessionLocal() as session:
        session.add(analysis)
        await session.commit()
        await session.refresh(analysis)

    logger.info(f"[{ticker}] Analyse importée (id={analysis.id})")

    return {
        "id": analysis.id,
        "ticker": ticker,
        "business_summary": sections["business_summary"],
        "competitive_moat": sections["competitive_moat"],
        "value_chain": sections["value_chain"],
        "financial_dynamics": sections["financial_dynamics"],
        "current_momentum": sections["current_momentum"],
        "specific_risks": sections["specific_risks"],
        "investment_thesis": sections["investment_thesis"] or analysis_text,
        "verdict_action": verdict["verdict_action"],
        "verdict_conviction": verdict["verdict_conviction"],
        "verdict_horizon": verdict["verdict_horizon"],
        "ideal_entry_price": verdict["ideal_entry_price"],
        "one_liner": verdict.get("one_liner"),
        "cost_usd": 0.0,
        "generated_at": now.isoformat(),
        "source": "claude.ai_paste",
    }


async def import_pasted_weekly(tickers: list[str], analysis_text: str) -> dict:
    """
    Importe une sélection hebdomadaire copiée-collée.
    Stocke le texte complet comme rationale dans WeeklySelection,
    ET crée un InvestmentAnalysis par ticker détecté dans le texte
    pour que les thèses apparaissent dans le Brief et les autres pages.
    """
    logger.info(f"Import sélection hebdo collée — {len(tickers)} tickers")
    now = datetime.utcnow()
    tickers_upper = [t.upper() for t in tickers]

    selection = WeeklySelection(
        week_start=date.today(),
        tickers=json.dumps(tickers_upper, ensure_ascii=False),
        selection_rationale=analysis_text,
        generated_at=now,
    )

    # ── Extraire les analyses individuelles par ticker ────────────────────
    # Le texte de Claude contient typiquement une section par ticker
    # séparée par des headings comme "## 1. TSM — TSMC" ou "### TSM"
    individual_analyses = _split_weekly_by_ticker(tickers_upper, analysis_text)
    created_analyses = []

    async with AsyncSessionLocal() as session:
        session.add(selection)

        for ticker, ticker_text in individual_analyses.items():
            # Parser verdict et sections pour ce ticker
            verdict = _parse_verdict(ticker_text)

            # Extraire les sections avec plusieurs stratégies
            sections = _extract_weekly_sections(ticker_text)

            analysis = InvestmentAnalysis(
                ticker=ticker,
                business_summary=sections["business_summary"],
                competitive_moat=sections["competitive_moat"],
                value_chain=sections["value_chain"],
                financial_dynamics=sections["financial_dynamics"],
                current_momentum=sections["current_momentum"],
                specific_risks=sections["specific_risks"],
                investment_thesis=sections["investment_thesis"] or ticker_text,
                verdict_action=verdict["verdict_action"],
                verdict_conviction=verdict["verdict_conviction"],
                verdict_horizon=verdict["verdict_horizon"],
                ideal_entry_price=verdict["ideal_entry_price"],
                one_liner=verdict.get("one_liner"),
                data_sources=json.dumps({"source": "claude.ai_paste", "type": "weekly"}, ensure_ascii=False),
                llm_model="claude.ai (copier-coller)",
                input_tokens=0,
                output_tokens=0,
                cost_usd=0.0,
                generated_at=now,
                expires_at=now + timedelta(days=CACHE_DAYS),
            )
            session.add(analysis)
            created_analyses.append(ticker)
            logger.info(f"[{ticker}] Analyse individuelle créée depuis import hebdo")

        await session.commit()
        await session.refresh(selection)

    logger.info(f"Sélection hebdo importée (id={selection.id}), {len(created_analyses)} analyses individuelles créées")

    return {
        "id": selection.id,
        "week_start": date.today().isoformat(),
        "tickers": tickers_upper,
        "selection_rationale": analysis_text,
        "generated_at": now.isoformat(),
        "source": "claude.ai_paste",
        "individual_analyses_created": created_analyses,
    }


def _split_weekly_by_ticker(tickers: list[str], text: str) -> dict[str, str]:
    """
    Découpe le texte d'une sélection hebdo en blocs par ticker.

    Cherche des patterns de heading contenant le ticker en début de section :
      - "TSM — Taiwan Semiconductor (cours ~370 $)"
      - "## 1. TSM — TSMC"
      - "### TSM (Taiwan Semiconductor)"
      - "**TSM** —"

    Le ticker doit apparaître au début d'une ligne (après un \n),
    éventuellement précédé de ##, numéro, ** etc.
    """
    ticker_positions = {}
    for ticker in tickers:
        # Pattern strict : le ticker doit être en début de ligne comme un heading
        # Ex: "\nTSM — " ou "\n## TSM" ou "\n1. **TSM**" ou "\n**TSM**"
        pattern = re.compile(
            rf"(?:^|\n)"
            rf"\s*(?:---\s*\n\s*)?"          # Optionnel: séparateur ---
            rf"(?:#+\s+)?"                   # Optionnel: ## ou ###
            rf"(?:\d+\.\s*)?"               # Optionnel: 1.
            rf"(?:\*\*)?{re.escape(ticker)}(?:\*\*)?"  # Le ticker (avec ou sans **)
            rf"\s*(?:—|–|-|\(|:)",           # Suivi d'un séparateur (pas juste mentionné dans le texte)
            re.MULTILINE,
        )
        match = pattern.search(text)
        if match:
            ticker_positions[ticker] = match.start()
            logger.info(f"[{ticker}] Section trouvée à position {match.start()}")

    if not ticker_positions:
        logger.warning("Aucun heading ticker trouvé dans le texte hebdo — attribution au premier")
        if tickers:
            return {tickers[0]: text}
        return {}

    # Trier par position dans le texte
    sorted_tickers = sorted(ticker_positions.items(), key=lambda x: x[1])

    result = {}
    for i, (ticker, start) in enumerate(sorted_tickers):
        if i + 1 < len(sorted_tickers):
            end = sorted_tickers[i + 1][1]
        else:
            # Chercher la section "Classement final" ou fin du texte
            classement_match = re.search(r"\n\s*(?:Classement final|Classement|Synthèse|Conclusion)", text[start:])
            if classement_match:
                end = start + classement_match.start()
            else:
                end = len(text)
        result[ticker] = text[start:end].strip()

    # Tickers listés mais sans section → leur donner le texte complet en fallback
    for ticker in tickers:
        if ticker not in result:
            logger.warning(f"[{ticker}] Pas de section trouvée dans le texte hebdo — fallback texte complet")
            result[ticker] = text

    return result


async def get_cached_analysis(ticker: str) -> dict | None:
    """
    Retourne l'analyse en cache si elle existe et n'est pas expirée.
    Retourne None sinon — le caller devra appeler generate_investment_thesis().
    """
    ticker = ticker.upper()
    now = datetime.utcnow()

    async with AsyncSessionLocal() as session:
        statement = (
            select(InvestmentAnalysis)
            .where(InvestmentAnalysis.ticker == ticker)
            .where(InvestmentAnalysis.expires_at > now)
            .order_by(InvestmentAnalysis.generated_at.desc())  # type: ignore[union-attr]
        )
        result = await session.exec(statement)
        analysis = result.first()

    if not analysis:
        return None

    logger.info(f"[{ticker}] Analyse en cache trouvée (id={analysis.id}, expire={analysis.expires_at})")

    return {
        "id": analysis.id,
        "ticker": analysis.ticker,
        "business_summary": analysis.business_summary,
        "competitive_moat": analysis.competitive_moat,
        "value_chain": analysis.value_chain,
        "financial_dynamics": analysis.financial_dynamics,
        "current_momentum": analysis.current_momentum,
        "specific_risks": analysis.specific_risks,
        "investment_thesis": analysis.investment_thesis,
        "verdict_action": analysis.verdict_action,
        "verdict_conviction": analysis.verdict_conviction,
        "verdict_horizon": analysis.verdict_horizon,
        "ideal_entry_price": analysis.ideal_entry_price,
        "one_liner": analysis.one_liner,
        "data_sources": json.loads(analysis.data_sources) if analysis.data_sources else {},
        "llm_model": analysis.llm_model,
        "input_tokens": analysis.input_tokens,
        "output_tokens": analysis.output_tokens,
        "cost_usd": analysis.cost_usd,
        "generated_at": analysis.generated_at.isoformat() if analysis.generated_at else None,
        "expires_at": analysis.expires_at.isoformat() if analysis.expires_at else None,
        "cached": True,
    }


async def run_weekly_selection() -> dict:
    """
    Sélection hebdomadaire des meilleures opportunités.

    Process en 3 étapes (optimisé coût) :
      1. Screening quantitatif sur SCAN_UNIVERSE via run_scan() — GRATUIT
         → Récupère le top 20 par score composite
      2. Deep analysis Claude API sur les 5 meilleurs — ~0.75$
         → Génère une thèse complète pour chaque ticker
      3. Sauvegarde WeeklySelection en DB

    Retourne un dict avec la liste des thèses et les métadonnées.
    """
    logger.info("Démarrage sélection hebdomadaire")
    now = datetime.utcnow()

    # ── Étape 1 : Screening gratuit ──────────────────────────────────────
    # run_scan retourne les opportunités triées par score composite
    scan_results = run_scan(max_results=WEEKLY_TOP_SCAN)
    logger.info(f"Scan quantitatif: {len(scan_results)} opportunités trouvées")

    if not scan_results:
        logger.warning("Aucune opportunité détectée — sélection hebdomadaire vide")
        return {
            "week_start": date.today().isoformat(),
            "tickers": [],
            "theses": [],
            "scan_count": 0,
            "deep_count": 0,
            "total_cost_usd": 0.0,
            "generated_at": now.isoformat(),
        }

    # Top N pour l'analyse deep
    top_candidates = scan_results[:WEEKLY_DEEP_COUNT]
    top_tickers = [c["ticker"] for c in top_candidates]
    logger.info(f"Top {len(top_tickers)} pour analyse deep: {top_tickers}")

    # ── Étape 2 : Deep analysis (séquentiel pour maîtriser le budget) ────
    theses: list[dict] = []
    total_cost: float = 0.0

    for candidate in top_candidates:
        ticker = candidate["ticker"]
        try:
            # Vérifier le cache d'abord
            cached = await get_cached_analysis(ticker)
            if cached:
                logger.info(f"[{ticker}] Utilisation du cache existant")
                theses.append(cached)
                continue

            thesis = await generate_investment_thesis(ticker)
            theses.append(thesis)
            total_cost += thesis.get("cost_usd", 0.0)
            logger.info(f"[{ticker}] Thèse générée — ${thesis.get('cost_usd', 0):.4f}")

        except Exception as e:
            logger.error(f"[{ticker}] Erreur génération thèse: {e}")
            # On continue avec les autres — pas de retry
            theses.append({
                "ticker": ticker,
                "error": str(e),
                "scores": candidate.get("scores", {}),
            })

    # ── Étape 3 : Sauvegarde WeeklySelection ─────────────────────────────
    # Construire le rationale à partir des scores du scan
    rationale_lines = []
    for i, candidate in enumerate(top_candidates):
        ticker = candidate["ticker"]
        composite = candidate.get("scores", {}).get("composite", "?")
        signal = candidate.get("signal_type", "?")
        rationale_lines.append(
            f"{i+1}. {ticker} — composite {composite}/10, signal: {signal}"
        )
    rationale = "Sélection basée sur le scoring quantitatif :\n" + "\n".join(rationale_lines)

    selection = WeeklySelection(
        week_start=date.today(),
        tickers=json.dumps(top_tickers, ensure_ascii=False),
        selection_rationale=rationale,
        generated_at=now,
    )

    async with AsyncSessionLocal() as session:
        session.add(selection)
        await session.commit()
        await session.refresh(selection)

    logger.info(
        f"Sélection hebdomadaire sauvegardée (id={selection.id}) — "
        f"{len(theses)} thèses, coût total: ${total_cost:.4f}"
    )

    return {
        "id": selection.id,
        "week_start": date.today().isoformat(),
        "tickers": top_tickers,
        "theses": theses,
        "scan_count": len(scan_results),
        "deep_count": len([t for t in theses if "error" not in t]),
        "total_cost_usd": total_cost,
        "selection_rationale": rationale,
        "generated_at": now.isoformat(),
    }
