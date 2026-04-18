"""
Service Earnings Play — détecte les publications de résultats imminentes.

Scanne l'univers d'investissement pour trouver les entreprises
qui publient dans les 7-21 prochains jours. Pour chacune, génère
une analyse pré-earnings : volatilité estimée, qualité du titre,
risque/récompense, et recommandation (buy/avoid/neutre).
"""
from datetime import date, datetime
import logging

from app.services.data_service import (
    get_earnings_calendar, get_price_changes, get_fundamentals, get_company_info,
)
from app.services.scoring import compute_all_scores, get_score_label
from app.services.scanner import SCAN_UNIVERSE

logger = logging.getLogger(__name__)


def scan_upcoming_earnings(max_days: int = 21) -> list[dict]:
    """
    Scanne toutes les entreprises de SCAN_UNIVERSE pour trouver
    celles qui publient dans les max_days prochains jours.

    Retourne une liste triée par date de publication (la plus proche en premier).
    """
    today = date.today()
    results = []

    all_tickers = [t for tickers in SCAN_UNIVERSE.values() for t in tickers]

    for ticker in all_tickers:
        try:
            cal = get_earnings_calendar(ticker)
            earnings_str = cal.get("earnings_date")
            if not earnings_str or str(earnings_str) == "None":
                continue

            earnings_dt = date.fromisoformat(str(earnings_str)[:10])
            days_until = (earnings_dt - today).days

            if days_until < 0 or days_until > max_days:
                continue

            # Récupérer données pour l'analyse pré-earnings
            changes = get_price_changes(ticker)
            fundamentals = get_fundamentals(ticker)
            scores = compute_all_scores(fundamentals, changes)
            info = get_company_info(ticker)

            # Identifier le secteur
            sector = None
            for s, tickers_list in SCAN_UNIVERSE.items():
                if ticker in tickers_list:
                    sector = s
                    break

            # Analyse pré-earnings
            composite = scores["composite"]
            quality = scores["quality"]["score"]
            risk = scores["risk"]["score"]

            # Volatilité estimée : basée sur l'amplitude 52W
            # Plus l'amplitude est large, plus le titre est volatile
            amp_52w = changes.get("amplitude_52w", 0) or 0
            vol_estimate = "élevée" if amp_52w > 60 else "modérée" if amp_52w > 30 else "faible"

            # Recommandation pré-earnings
            # Bon score + qualité solide = potentiel haussier si bons résultats
            # Mauvais score + haute volatilité = risque de baisse
            if composite >= 7.0 and quality >= 6.5:
                recommendation = "buy_before"
                rec_label = "Renforcer avant résultats"
                rec_reason = "Score solide, qualité élevée — probable surperformance si résultats conformes"
            elif composite >= 6.0 and risk >= 5.0:
                recommendation = "hold_watch"
                rec_label = "Conserver et surveiller"
                rec_reason = "Profil correct, résultats pourraient confirmer la thèse"
            elif composite < 5.0 or risk < 3.5:
                recommendation = "avoid"
                rec_label = "Éviter avant résultats"
                rec_reason = "Profil risqué, volatilité potentielle trop élevée"
            else:
                recommendation = "neutral"
                rec_label = "Neutre"
                rec_reason = "Pas de signal fort dans un sens ou l'autre"

            results.append({
                "ticker": ticker,
                "name": info.get("longName") or info.get("shortName") or ticker,
                "sector": sector,
                "earnings_date": earnings_dt.isoformat(),
                "days_until": days_until,
                "current_price": changes.get("current_price"),
                "change_1d": changes.get("change_1d"),
                "change_1m": changes.get("change_1m"),
                "pct_from_52w_high": changes.get("pct_from_52w_high"),
                "volatility_estimate": vol_estimate,
                "scores": {
                    "composite": composite,
                    "quality": quality,
                    "valuation": scores["valuation"]["score"],
                    "growth": scores["growth"]["score"],
                    "momentum": scores["momentum"]["score"],
                    "risk": risk,
                },
                "composite_label": get_score_label(composite),
                "recommendation": recommendation,
                "recommendation_label": rec_label,
                "recommendation_reason": rec_reason,
                "revenue_estimate": cal.get("revenue_estimate"),
                "eps_estimate": cal.get("eps_estimate"),
                "scanned_at": datetime.utcnow().isoformat(),
            })

        except Exception as e:
            logger.warning(f"Earnings scan {ticker}: {e}")
            continue

    # Tri par date de publication (la plus proche d'abord)
    results.sort(key=lambda x: x["days_until"])
    return results
