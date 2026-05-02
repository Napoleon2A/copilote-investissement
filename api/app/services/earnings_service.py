"""
Service Earnings Play — détecte les publications de résultats imminentes.

Scanne l'univers d'investissement pour trouver les entreprises
qui publient dans les 7-21 prochains jours. Pour chacune, génère
une analyse pré-earnings : volatilité estimée, qualité du titre,
risque/récompense, et recommandation (buy/avoid/neutre).
"""
from datetime import date, datetime
from typing import Optional
import logging

from app.services.data_service import (
    get_earnings_calendar, get_price_changes, get_fundamentals, get_company_info,
)
from app.services.scoring import compute_all_scores, get_score_label
from app.services.scanner import SCAN_UNIVERSE

logger = logging.getLogger(__name__)


def scan_upcoming_earnings(max_days: int = 21, extra_tickers: list[str] | None = None, use_finnhub: bool = True) -> list[dict]:
    """
    Scanne les publications de résultats à venir.

    Si use_finnhub=True et clé configurée → utilise Finnhub (calendrier complet, ~tout le marché).
    Sinon fallback sur SCAN_UNIVERSE + extra_tickers.

    Retourne une liste triée par date de publication (la plus proche en premier).
    Pour les tickers du SCAN_UNIVERSE, l'analyse pré-earnings (scores) est enrichie.
    Pour les tickers Finnhub hors univers, on retourne les infos de base.
    """
    today = date.today()
    results = []

    universe_tickers = [t for tickers in SCAN_UNIVERSE.values() for t in tickers]
    universe_set = set(universe_tickers)

    # Fusion avec extra_tickers (positions / idées du user qui peuvent être hors univers)
    extras_set = {t.strip().upper() for t in (extra_tickers or []) if t and t.strip()}
    enriched_set = universe_set | extras_set  # Tickers qu'on enrichit avec scores

    # Source : Finnhub (calendrier complet) si dispo, sinon univers seul
    candidate_tickers: set[str] = set()
    finnhub_dates: dict[str, str] = {}  # ticker → date ISO depuis Finnhub

    if use_finnhub:
        try:
            from app.services import finnhub_calendar
            if finnhub_calendar.is_configured():
                fh_data = finnhub_calendar.get_cached_calendar(max_days=max_days)
                for entry in fh_data:
                    sym = entry.get("symbol")
                    if sym:
                        candidate_tickers.add(sym.upper())
                        date_str = entry.get("date")
                        if date_str:
                            finnhub_dates[sym.upper()] = date_str
        except Exception as e:
            logger.warning(f"Finnhub disabled or errored : {e}")

    # Toujours inclure univers + extras (pour avoir les scores et fallback si Finnhub vide)
    candidate_tickers |= enriched_set
    all_tickers = sorted(candidate_tickers)

    for ticker in all_tickers:
        try:
            should_enrich = ticker in enriched_set

            # Détermination de la date :
            # - Tickers enrichis : on utilise yfinance (plus précis)
            # - Tickers Finnhub-only : on utilise finnhub_dates
            earnings_dt: Optional[date] = None
            if should_enrich:
                try:
                    cal = get_earnings_calendar(ticker)
                    earnings_str = cal.get("earnings_date")
                    if earnings_str and str(earnings_str) != "None":
                        earnings_dt = date.fromisoformat(str(earnings_str)[:10])
                except Exception:
                    pass
            if earnings_dt is None and ticker in finnhub_dates:
                try:
                    earnings_dt = date.fromisoformat(finnhub_dates[ticker])
                except Exception:
                    pass
            if earnings_dt is None:
                continue

            days_until = (earnings_dt - today).days
            if days_until < 0 or days_until > max_days:
                continue

            if not should_enrich:
                # Entrée minimale pour les tickers Finnhub-only (pas d'enrichissement yfinance)
                results.append({
                    "ticker": ticker,
                    "name": ticker,
                    "sector": None,
                    "earnings_date": earnings_dt.isoformat(),
                    "days_until": days_until,
                    "current_price": None,
                    "change_1d": None,
                    "change_1m": None,
                    "pct_from_52w_high": None,
                    "volatility_estimate": None,
                    "scores": {"composite": None},
                    "composite_label": None,
                    "recommendation": None,
                    "recommendation_label": None,
                    "recommendation_reason": None,
                    "source": "finnhub",
                })
                continue

            # Enrichissement complet pour les tickers de l'univers + extras
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
