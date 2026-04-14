"""
Brief quotidien — Narrative Synthesis Engine

Ce module produit le brief d'investissement du jour :
  - Alertes sur les lignes détenues
  - Signaux notables sur la watchlist
  - Résumé macro minimal
  - Top idées utilisateur en attente de suivi

La sortie est une liste courte (3 à 7 items max) orientée décision.
Chaque item a un type, un message court et une action suggérée.
"""
from datetime import datetime
from typing import Optional
from app.services.data_service import get_price_changes, get_fundamentals
from app.services.scoring import compute_all_scores, get_score_label
import logging

logger = logging.getLogger(__name__)


# Types d'items du brief
BRIEF_TYPES = {
    "portfolio_alert": "Alerte portefeuille",
    "opportunity": "Opportunité détectée",
    "watchlist_signal": "Signal watchlist",
    "idea_followup": "Idée à revisiter",
    "market_note": "Note de marché",
}

# Actions suggérées
ACTIONS = {
    "watch": "Surveiller",
    "read": "Approfondir",
    "buy_small": "Initier petite ligne",
    "add": "Renforcer",
    "reduce": "Alléger",
    "avoid": "Éviter",
    "hold": "Ne rien faire",
    "review_thesis": "Relire la thèse",
}


def _analyze_ticker_for_brief(ticker: str, context: str = "") -> Optional[dict]:
    """
    Analyse un ticker et produit un item de brief si quelque chose est notable.
    Retourne None si rien de notable.
    """
    try:
        changes = get_price_changes(ticker)
        if not changes:
            return None

        fundamentals = get_fundamentals(ticker)
        scores = compute_all_scores(fundamentals, changes)

        signals = []
        action = "hold"
        priority = 0  # Plus élevé = plus prioritaire

        current = changes.get("current_price", 0)
        change_1d = changes.get("change_1d")
        change_1m = changes.get("change_1m")
        pct_from_high = changes.get("pct_from_52w_high")

        # ── Signal 1 : Mouvement journalier fort ─────────────────────────────
        if change_1d is not None:
            if abs(change_1d) >= 5:
                direction = "hausse" if change_1d > 0 else "baisse"
                signals.append(f"Mouvement significatif : {change_1d:+.1f}% aujourd'hui")
                priority += 3 if abs(change_1d) >= 8 else 2
                action = "read"

        # ── Signal 2 : Baisse depuis le plus haut + qualité préservée ────────
        composite = scores["composite"]
        if pct_from_high is not None and pct_from_high < -25 and composite >= 6.5:
            signals.append(
                f"Titre {abs(pct_from_high):.0f}% sous son plus haut, "
                f"mais qualité maintenue (score={composite}/10)"
            )
            priority += 2
            action = "read"

        # ── Signal 3 : Score composite fort ──────────────────────────────────
        if composite >= 7.5:
            signals.append(f"Score composite élevé : {composite}/10 ({get_score_label(composite)})")
            priority += 1

        # ── Signal 4 : Score valorisation fort ───────────────────────────────
        val_score = scores["valuation"]["score"]
        if val_score >= 7.5:
            signals.append(f"Valorisation attractive (score={val_score}/10)")
            priority += 1

        # ── Signal 5 : Risque dégradé ─────────────────────────────────────────
        risk_score = scores["risk"]["score"]
        if risk_score <= 3.5:
            signals.append(f"Risque élevé détecté (score={risk_score}/10)")
            action = "review_thesis"
            priority += 1

        # Pas de signal notable → on n'inclut pas dans le brief
        if not signals:
            return None

        return {
            "ticker": ticker,
            "type": "portfolio_alert" if "portfolio" in context else "watchlist_signal",
            "context": context,
            "current_price": current,
            "change_1d": change_1d,
            "change_1m": change_1m,
            "signals": signals,
            "scores": {
                "composite": composite,
                "quality": scores["quality"]["score"],
                "valuation": val_score,
                "momentum": scores["momentum"]["score"],
                "risk": risk_score,
            },
            "action": action,
            "action_label": ACTIONS.get(action, action),
            "priority": priority,
            "why_now": signals[0] if signals else "",
            "generated_at": datetime.utcnow().isoformat(),
        }
    except Exception as e:
        logger.error(f"Erreur brief ticker {ticker}: {e}")
        return None


def generate_daily_brief(
    portfolio_tickers: list[str],
    watchlist_tickers: list[str],
    idea_tickers: list[str],
    max_items: int = 7,
) -> dict:
    """
    Génère le brief quotidien complet.

    Priorité : portefeuille > watchlist > idées utilisateur.
    Maximum max_items items dans le brief principal.
    """
    items = []

    # Analyser les positions du portefeuille en priorité
    for ticker in portfolio_tickers:
        item = _analyze_ticker_for_brief(ticker, context="portfolio")
        if item:
            item["type"] = "portfolio_alert"
            items.append(item)
        else:
            # Données disponibles mais aucun signal fort — on affiche quand même
            # la ligne avec prix courant et score, sans signal particulier
            changes = get_price_changes(ticker)
            if changes:
                fundamentals = get_fundamentals(ticker)
                scores = compute_all_scores(fundamentals, changes)
                items.append({
                    "ticker": ticker,
                    "type": "portfolio_alert",
                    "context": "portfolio",
                    "current_price": changes.get("current_price"),
                    "change_1d": changes.get("change_1d"),
                    "change_1m": changes.get("change_1m"),
                    "signals": ["Journée calme — aucun signal notable"],
                    "scores": {
                        "composite": scores["composite"],
                        "quality": scores["quality"]["score"],
                        "valuation": scores["valuation"]["score"],
                        "momentum": scores["momentum"]["score"],
                        "risk": scores["risk"]["score"],
                    },
                    "action": "hold",
                    "action_label": ACTIONS["hold"],
                    "priority": 1,
                    "why_now": f"Ligne détenue — variation 1J : {changes.get('change_1d', 0):+.1f}%",
                    "generated_at": datetime.utcnow().isoformat(),
                })
            else:
                # Vraiment pas de données (rate-limit ou marché fermé)
                items.append({
                    "ticker": ticker,
                    "type": "portfolio_alert",
                    "context": "portfolio",
                    "current_price": None,
                    "change_1d": None,
                    "change_1m": None,
                    "signals": ["Données de marché indisponibles"],
                    "scores": {},
                    "action": "hold",
                    "action_label": ACTIONS["hold"],
                    "priority": 1,
                    "why_now": "Ligne détenue — données yfinance indisponibles",
                    "generated_at": datetime.utcnow().isoformat(),
                })

    # Analyser la watchlist
    for ticker in watchlist_tickers:
        if ticker not in portfolio_tickers:  # éviter doublons
            item = _analyze_ticker_for_brief(ticker, context="watchlist")
            if item:
                items.append(item)

    # Rappels sur les idées utilisateur
    for ticker in idea_tickers:
        if ticker not in portfolio_tickers and ticker not in watchlist_tickers:
            item = _analyze_ticker_for_brief(ticker, context="user_idea")
            if item:
                item["type"] = "idea_followup"
                items.append(item)

    # Trier par priorité décroissante et limiter
    items.sort(key=lambda x: x.get("priority", 0), reverse=True)
    top_items = items[:max_items]

    # Résumé de marché minimal (indices via yfinance)
    market_summary = _get_market_summary()

    return {
        "date": datetime.utcnow().date().isoformat(),
        "generated_at": datetime.utcnow().isoformat(),
        "item_count": len(top_items),
        "items": top_items,
        "market_summary": market_summary,
        "disclaimer": (
            "Ce brief est généré automatiquement à titre informatif. "
            "Il ne constitue pas un conseil en investissement. "
            "Vérifiez toujours les données avant d'agir."
        ),
    }


def _get_market_summary() -> dict:
    """
    Résumé de marché minimal : S&P 500, CAC 40, VIX, 10Y US.
    Ne bloque pas le brief si une donnée manque.
    """
    from app.services.data_service import get_price_changes

    summary = {}
    indices = {
        "SP500": "^GSPC",
        "CAC40": "^FCHI",
        "NASDAQ": "^IXIC",
        "VIX": "^VIX",
    }

    for name, ticker in indices.items():
        try:
            changes = get_price_changes(ticker)
            if changes:
                summary[name] = {
                    "price": changes.get("current_price"),
                    "change_1d": changes.get("change_1d"),
                    "change_ytd": changes.get("change_ytd"),
                }
        except Exception:
            pass  # Indice non disponible → on l'ignore silencieusement

    return summary


def generate_company_brief(ticker: str) -> dict:
    """
    Note courte sur une entreprise — utilisée pour les fiches et les idées.
    Format : pourquoi ça peut être intéressant + risques + action suggérée.
    """
    from app.services.data_service import get_company_info, get_news

    info = get_company_info(ticker)
    changes = get_price_changes(ticker)
    fundamentals = get_fundamentals(ticker)
    scores = compute_all_scores(fundamentals, changes)
    news = get_news(ticker, count=3)

    # ── Arguments POUR (points favorables) ─────────────────────────────────
    # Règle : on n'inclut une raison dans "Pour" que si le score du critère est >= 5.
    # On prend le label du critère + sa meilleure raison.
    pro_args = []
    con_args = []

    PRO_THRESHOLD = 5.5  # score minimum pour qu'un critère soit "favorable"
    CON_THRESHOLD = 4.5  # score maximum pour qu'un critère soit "défavorable"

    # Mots indiquant qu'une raison est favorable (pour filtrer les raisons mixtes)
    _POSITIVE_HINTS = (
        "bonne liquidité", "bonne ", "faible (d/e", "dette très faible",
        "dette maîtrisée", "stable (amplitude", "titre stable",
        "faible dette", "marge opé. excellente", "marge opé. bonne",
        "roe élevé", "roe correct", "marge nette forte",
        "croissance ca", "croissance résultats", "p/e très bas",
        "p/e raisonnable", "ev/ebitda attractif", "peg < 1",
        "upside analystes", "forte hausse", "bonne performance",
        "excellent momentum", "momentum positif",
    )

    def _is_positive_reason(r: str) -> bool:
        r_low = r.lower()
        return any(hint in r_low for hint in _POSITIVE_HINTS)

    for key in ["quality", "valuation", "growth", "momentum", "risk"]:
        sc = scores[key]["score"]
        reasons = [r for r in scores[key].get("reasons", [])
                   if "insuffisant" not in r.lower()]

        if sc >= PRO_THRESHOLD:
            # Prend la première raison positive du critère
            for r in reasons:
                if _is_positive_reason(r) or sc >= 7:
                    pro_args.append(r)
                    break
            else:
                if reasons:
                    pro_args.append(reasons[0])
        elif sc <= CON_THRESHOLD:
            # Prend la première raison NÉGATIVE du critère
            for r in reasons:
                if not _is_positive_reason(r):
                    con_args.append(r)
                    break

    # Compléter con_args avec les raisons négatives du risque si score très bas
    if scores["risk"]["score"] <= CON_THRESHOLD:
        for r in scores["risk"].get("reasons", []):
            if not _is_positive_reason(r) and r not in con_args and "insuffisant" not in r.lower():
                con_args.append(r)
                if len(con_args) >= 4:
                    break

    # Déduplication et nettoyage
    pro_args = list(dict.fromkeys(pro_args))[:5]
    con_args = list(dict.fromkeys(con_args))[:5]

    # Fallback si vraiment rien
    if not pro_args:
        pro_args = ["Pas de point favorable identifié avec les données disponibles"]
    if not con_args:
        con_args = ["Pas de point défavorable identifié avec les données disponibles"]

    # Déterminer l'action suggérée
    composite = scores["composite"]
    if composite >= 7.5:
        action = "read"
        conviction = "élevé"
    elif composite >= 6:
        action = "watch"
        conviction = "moyen"
    else:
        action = "avoid"
        conviction = "faible"

    # Horizon
    momentum_score = scores["momentum"]["score"]
    if momentum_score >= 7:
        horizon = "semaines"
    elif composite >= 7:
        horizon = "trimestres"
    else:
        horizon = "à définir"

    return {
        "ticker": ticker.upper(),
        "name": info.get("longName") or info.get("shortName", ticker),
        "sector": info.get("sector"),
        "generated_at": datetime.utcnow().isoformat(),
        "current_price": changes.get("current_price"),
        "change_1d": changes.get("change_1d"),
        "change_1m": changes.get("change_1m"),
        "change_ytd": changes.get("change_ytd"),
        "scores": {
            "composite": scores["composite"],
            "composite_label": get_score_label(scores["composite"]),
            "quality": scores["quality"]["score"],
            "valuation": scores["valuation"]["score"],
            "growth": scores["growth"]["score"],
            "momentum": scores["momentum"]["score"],
            "risk": scores["risk"]["score"],
        },
        "pro_args": pro_args,
        "con_args": con_args,
        "action": action,
        "action_label": ACTIONS.get(action, action),
        "conviction": conviction,
        "horizon": horizon,
        "recent_news": news,
        "key_metrics": {
            "pe_ratio": fundamentals.get("pe_ratio"),
            "ev_ebitda": fundamentals.get("ev_to_ebitda"),
            "operating_margin": fundamentals.get("operating_margin"),
            "roe": fundamentals.get("roe"),
            "revenue_growth": fundamentals.get("revenue_growth"),
            "debt_to_equity": fundamentals.get("debt_to_equity"),
            "free_cashflow": fundamentals.get("free_cashflow"),
        },
        "disclaimer": "Analyse automatique — données yfinance. À vérifier avant toute décision.",
    }
