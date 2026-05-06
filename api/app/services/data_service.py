"""
Service de données de marché — Provider : yfinance (gratuit)

Ce module est la seule couche qui touche à yfinance.
Si on change de provider un jour, on ne modifie que ce fichier.

Données disponibles avec yfinance :
  - Prix en quasi-temps réel (15 min delay pour US, variable Europe)
  - Historiques OHLCV jusqu'à 20 ans
  - Fondamentaux : P/E, EV/EBITDA, marges, ROE, dette, etc.
  - Info entreprise : secteur, industrie, description, site
  - News récentes (RSS Yahoo Finance)
  - Earnings calendar approximatif

Limites connues :
  - Pas de données intrajournalières fiables au-delà de 60 jours
  - Fondamentaux parfois incomplets ou décalés pour les small caps européennes
  - Pas de données institutionnelles ni d'insider transactions fiables
  - Pas de garantie de SLA — Yahoo peut changer son API sans préavis
"""
import yfinance as yf
import pandas as pd
from datetime import datetime, date, timedelta
from typing import Optional
import logging
import time

logger = logging.getLogger(__name__)

# Cache mémoire simple : évite de re-fetch la même donnée dans la même session.
# Clé = (ticker, type), valeur = (timestamp, data).
# TTL : 15 min pour l'info et les fondamentaux, 5 min pour les prix.
_cache: dict[tuple, tuple[float, object]] = {}
_CACHE_TTL_INFO = 900   # 15 min
_CACHE_TTL_PRICE = 300  # 5 min


def _cache_get(key: tuple, ttl: int):
    entry = _cache.get(key)
    if entry and (time.time() - entry[0]) < ttl:
        return entry[1]
    return None


def _cache_set(key: tuple, value):
    _cache[key] = (time.time(), value)


def get_company_info(ticker: str) -> dict:
    """
    Récupère les informations de base d'une entreprise.
    Retourne un dict vide si le ticker n'existe pas ou si Yahoo rate-limite.
    Cache 15 min pour éviter de spammer Yahoo Finance.
    """
    key = (ticker.upper(), "info")
    cached = _cache_get(key, _CACHE_TTL_INFO)
    if cached is not None:
        return cached
    try:
        stock = yf.Ticker(ticker.upper())
        info = stock.info
        if not info:
            logger.warning(f"Ticker {ticker} : aucune donnée yfinance")
            return {}
        has_identity = info.get("symbol") or info.get("shortName") or info.get("longName")
        if not has_identity:
            logger.warning(f"Ticker {ticker} introuvable sur Yahoo Finance")
            return {}
        _cache_set(key, info)
        return info
    except Exception as e:
        logger.error(f"Erreur récupération info {ticker}: {e}")
        return {}


def get_current_price(ticker: str) -> Optional[float]:
    """Prix actuel (ou dernier prix connu). None si indisponible."""
    info = get_company_info(ticker)
    return (
        info.get("currentPrice")
        or info.get("regularMarketPrice")
        or info.get("previousClose")
    )


def get_price_history(ticker: str, period: str = "1y") -> pd.DataFrame:
    """
    Historique OHLCV.
    period : "1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"
    Retourne DataFrame vide si échec. Cache 5 min par (ticker, period).
    """
    key = (ticker.upper(), f"hist_{period}")
    cached = _cache_get(key, _CACHE_TTL_PRICE)
    if cached is not None:
        return cached
    try:
        stock = yf.Ticker(ticker.upper())
        df = stock.history(period=period, auto_adjust=True)
        if not df.empty:
            _cache_set(key, df)
        return df
    except Exception as e:
        logger.error(f"Erreur historique {ticker}: {e}")
        return pd.DataFrame()


def get_fundamentals(ticker: str) -> dict:
    """
    Ratios financiers clés depuis yfinance.
    Chaque clé manquante → None (jamais d'exception propagée).

    Données fiables pour les large caps US et Europe.
    Pour les small caps, vérifier manuellement les valeurs aberrantes.
    """
    info = get_company_info(ticker)
    if not info:
        return {}

    # On extrait uniquement ce qui est utile en V1
    # Chaque ratio est nommé de façon explicite pour rester lisible
    return {
        # Valorisation
        "pe_ratio": info.get("trailingPE"),
        "forward_pe": info.get("forwardPE"),
        "peg_ratio": info.get("pegRatio"),
        "price_to_book": info.get("priceToBook"),
        "price_to_sales": info.get("priceToSalesTrailing12Months"),
        "ev_to_ebitda": info.get("enterpriseToEbitda"),
        "ev_to_revenue": info.get("enterpriseToRevenue"),

        # Rendement
        "dividend_yield": info.get("dividendYield"),
        "dividend_rate": info.get("dividendRate"),

        # Rentabilité
        "gross_margin": info.get("grossMargins"),
        "operating_margin": info.get("operatingMargins"),
        "net_margin": info.get("profitMargins"),
        "roe": info.get("returnOnEquity"),
        "roa": info.get("returnOnAssets"),

        # Croissance
        "revenue_growth": info.get("revenueGrowth"),
        "earnings_growth": info.get("earningsGrowth"),
        "earnings_quarterly_growth": info.get("earningsQuarterlyGrowth"),

        # Bilan
        "total_debt": info.get("totalDebt"),
        "cash": info.get("totalCash"),
        "debt_to_equity": info.get("debtToEquity"),
        "current_ratio": info.get("currentRatio"),
        "quick_ratio": info.get("quickRatio"),

        # Cash flow
        "free_cashflow": info.get("freeCashflow"),
        "operating_cashflow": info.get("operatingCashflow"),

        # Marché
        "market_cap": info.get("marketCap"),
        "enterprise_value": info.get("enterpriseValue"),
        "shares_outstanding": info.get("sharesOutstanding"),
        "float_shares": info.get("floatShares"),
        "shares_short": info.get("sharesShort"),

        # 52 semaines
        "week_52_high": info.get("fiftyTwoWeekHigh"),
        "week_52_low": info.get("fiftyTwoWeekLow"),
        "fifty_day_avg": info.get("fiftyDayAverage"),
        "two_hundred_day_avg": info.get("twoHundredDayAverage"),

        # Recommandation analystes
        "recommendation": info.get("recommendationKey"),
        "target_price": info.get("targetMeanPrice"),
        "analyst_count": info.get("numberOfAnalystOpinions"),
    }


def get_price_changes(ticker: str) -> dict:
    """
    Calcule les variations de prix sur plusieurs horizons.
    Toutes les données viennent de l'historique yfinance.
    """
    try:
        hist_1y = get_price_history(ticker, period="1y")
        if hist_1y.empty:
            return {}

        current = hist_1y["Close"].iloc[-1]
        changes = {"current_price": round(current, 2)}

        def safe_change(past_price: float) -> Optional[float]:
            if past_price and past_price > 0:
                return round((current - past_price) / past_price * 100, 2)
            return None

        # Variation 1 jour
        if len(hist_1y) >= 2:
            changes["change_1d"] = safe_change(hist_1y["Close"].iloc[-2])

        # Variation 5 jours
        if len(hist_1y) >= 6:
            changes["change_5d"] = safe_change(hist_1y["Close"].iloc[-6])

        # Variation 1 mois (~21 jours de bourse)
        if len(hist_1y) >= 22:
            changes["change_1m"] = safe_change(hist_1y["Close"].iloc[-22])

        # Variation 3 mois (~63 jours de bourse)
        if len(hist_1y) >= 64:
            changes["change_3m"] = safe_change(hist_1y["Close"].iloc[-64])

        # YTD
        hist_ytd = get_price_history(ticker, period="ytd")
        if not hist_ytd.empty:
            changes["change_ytd"] = safe_change(hist_ytd["Close"].iloc[0])

        # Distance depuis le 52W high/low
        high_52w = hist_1y["High"].max()
        low_52w = hist_1y["Low"].min()
        changes["pct_from_52w_high"] = round((current - high_52w) / high_52w * 100, 2)
        changes["pct_from_52w_low"] = round((current - low_52w) / low_52w * 100, 2)

        return changes
    except Exception as e:
        logger.error(f"Erreur calcul variations {ticker}: {e}")
        return {}


def get_news(ticker: str, count: int = 10) -> list[dict]:
    """
    News récentes depuis Yahoo Finance.
    Retourne une liste de dicts avec title, link, published, publisher.

    Structure yfinance ≥1.0 : chaque item = {"id": ..., "content": {...}}
    Structure yfinance 0.x  : chaque item = {"title": ..., "link": ..., ...}
    On supporte les deux.
    """
    try:
        stock = yf.Ticker(ticker.upper())
        news = stock.news or []
        result = []
        for item in news[:count]:
            # yfinance ≥1.0
            if "content" in item:
                c = item["content"]
                result.append({
                    "title": c.get("title", ""),
                    "link": (c.get("canonicalUrl") or {}).get("url", ""),
                    "publisher": (c.get("provider") or {}).get("displayName", ""),
                    "published": c.get("pubDate"),
                    "type": c.get("contentType", "STORY"),
                })
            else:
                # yfinance 0.x (fallback)
                result.append({
                    "title": item.get("title", ""),
                    "link": item.get("link", ""),
                    "publisher": item.get("publisher", ""),
                    "published": datetime.fromtimestamp(item.get("providerPublishTime", 0)).isoformat()
                                 if item.get("providerPublishTime") else None,
                    "type": item.get("type", "STORY"),
                })
        return result
    except Exception as e:
        logger.error(f"Erreur news {ticker}: {e}")
        return []


def get_earnings_calendar(ticker: str) -> dict:
    """Prochaine date de résultats si disponible."""
    try:
        stock = yf.Ticker(ticker.upper())
        cal = stock.calendar
        if cal is not None and not (isinstance(cal, dict) and not cal):
            if isinstance(cal, dict):
                return {
                    "earnings_date": str(cal.get("Earnings Date", [None])[0])
                                     if cal.get("Earnings Date") else None,
                    "revenue_estimate": cal.get("Revenue Estimate"),
                    "eps_estimate": cal.get("EPS Estimate"),
                }
        return {}
    except Exception as e:
        logger.error(f"Erreur calendrier {ticker}: {e}")
        return {}


def get_deep_profile(ticker: str) -> dict:
    """
    Profil approfondi d'une entreprise — exploite toutes les données yfinance disponibles.

    Retourne un dict structuré avec :
      - identity : description business, management, employés, site web
      - ownership : insiders, institutionnels, insider transactions récentes
      - analyst_view : recommendations, price targets, upgrades/downgrades
      - earnings_track : historique EPS actual vs estimate (streak de beats)
      - financials : income statement, balance sheet, cashflow (3 dernières années)
      - governance : scores de risque audit/board/compensation
      - short_interest : short ratio, short % of float

    Cache 30 min. Chaque sous-appel est isolé en try/except pour ne jamais casser
    même si une donnée est indisponible.
    """
    key = (ticker.upper(), "deep_profile")
    cached = _cache_get(key, 1800)  # 30 min
    if cached is not None:
        return cached

    stock = yf.Ticker(ticker.upper())
    info = get_company_info(ticker)
    result = {}

    # ── Identity ──────────────────────────────────────────────────────────
    result["identity"] = {
        "long_business_summary": info.get("longBusinessSummary"),
        "full_time_employees": info.get("fullTimeEmployees"),
        "website": info.get("website"),
        "beta": info.get("beta"),
        "city": info.get("city"),
        "state": info.get("state"),
        "country": info.get("country"),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
    }

    # Management (companyOfficers)
    try:
        officers = info.get("companyOfficers", [])
        result["identity"]["officers"] = [
            {
                "name": o.get("name"),
                "title": o.get("title"),
                "total_pay": o.get("totalPay"),
                "age": o.get("age"),
            }
            for o in (officers or [])[:5]
        ]
    except Exception:
        result["identity"]["officers"] = []

    # ── Ownership ─────────────────────────────────────────────────────────
    result["ownership"] = {
        "held_percent_insiders": info.get("heldPercentInsiders"),
        "held_percent_institutions": info.get("heldPercentInstitutions"),
    }

    # Top institutional holders
    try:
        inst = stock.institutional_holders
        if inst is not None and not inst.empty:
            result["ownership"]["top_institutional"] = [
                {
                    "holder": row.get("Holder", ""),
                    "shares": int(row.get("Shares", 0)),
                    "pct_out": float(row.get("pctHeld", 0)) if row.get("pctHeld") else None,
                    "value": float(row.get("Value", 0)) if row.get("Value") else None,
                }
                for _, row in inst.head(10).iterrows()
            ]
        else:
            result["ownership"]["top_institutional"] = []
    except Exception as e:
        logger.debug(f"Deep profile {ticker}: institutional_holders indispo: {e}")
        result["ownership"]["top_institutional"] = []

    # Insider transactions
    try:
        insiders = stock.insider_transactions
        if insiders is not None and not insiders.empty:
            result["ownership"]["insider_transactions"] = [
                {
                    "insider": row.get("Insider", ""),
                    "relation": row.get("Insider Relation", ""),
                    "transaction": row.get("Transaction", ""),
                    "shares": int(row.get("Shares", 0)) if pd.notna(row.get("Shares")) else None,
                    "date": str(row.get("Start Date", ""))[:10] if pd.notna(row.get("Start Date")) else None,
                }
                for _, row in insiders.head(10).iterrows()
            ]
        else:
            result["ownership"]["insider_transactions"] = []
    except Exception as e:
        logger.debug(f"Deep profile {ticker}: insider_transactions indispo: {e}")
        result["ownership"]["insider_transactions"] = []

    # ── Analyst view ──────────────────────────────────────────────────────
    result["analyst_view"] = {}

    # Recommendations summary
    try:
        reco = stock.recommendations
        if reco is not None and not reco.empty:
            latest = reco.tail(1).iloc[0]
            result["analyst_view"]["recommendations"] = {
                "strong_buy": int(latest.get("strongBuy", 0)),
                "buy": int(latest.get("buy", 0)),
                "hold": int(latest.get("hold", 0)),
                "sell": int(latest.get("sell", 0)),
                "strong_sell": int(latest.get("strongSell", 0)),
            }
        else:
            result["analyst_view"]["recommendations"] = None
    except Exception as e:
        logger.debug(f"Deep profile {ticker}: recommendations indispo: {e}")
        result["analyst_view"]["recommendations"] = None

    # Analyst price targets
    try:
        targets = stock.analyst_price_targets
        if targets is not None:
            if isinstance(targets, dict):
                result["analyst_view"]["price_targets"] = {
                    "high": targets.get("high"),
                    "low": targets.get("low"),
                    "mean": targets.get("mean"),
                    "median": targets.get("median"),
                    "current": targets.get("current"),
                }
            elif isinstance(targets, pd.DataFrame) and not targets.empty:
                result["analyst_view"]["price_targets"] = {
                    "high": float(targets.get("high", [None])[0]) if "high" in targets else None,
                    "low": float(targets.get("low", [None])[0]) if "low" in targets else None,
                    "mean": float(targets.get("mean", [None])[0]) if "mean" in targets else None,
                    "median": float(targets.get("median", [None])[0]) if "median" in targets else None,
                }
            else:
                result["analyst_view"]["price_targets"] = None
        else:
            result["analyst_view"]["price_targets"] = None
    except Exception as e:
        logger.debug(f"Deep profile {ticker}: price_targets indispo: {e}")
        result["analyst_view"]["price_targets"] = None

    # Upgrades/downgrades récents
    try:
        upgrades = stock.upgrades_downgrades
        if upgrades is not None and not upgrades.empty:
            recent = upgrades.head(10)
            result["analyst_view"]["upgrades_downgrades"] = [
                {
                    "date": str(idx)[:10] if hasattr(idx, 'strftime') else str(idx)[:10],
                    "firm": row.get("Firm", ""),
                    "to_grade": row.get("ToGrade", ""),
                    "from_grade": row.get("FromGrade", ""),
                    "action": row.get("Action", ""),
                }
                for idx, row in recent.iterrows()
            ]
        else:
            result["analyst_view"]["upgrades_downgrades"] = []
    except Exception as e:
        logger.debug(f"Deep profile {ticker}: upgrades_downgrades indispo: {e}")
        result["analyst_view"]["upgrades_downgrades"] = []

    # ── Earnings track record ─────────────────────────────────────────────
    try:
        earnings_hist = stock.earnings_history
        if earnings_hist is not None and not earnings_hist.empty:
            records = []
            for _, row in earnings_hist.iterrows():
                records.append({
                    "quarter": str(row.get("Quarter", "")),
                    "eps_estimate": float(row.get("epsEstimate", 0)) if pd.notna(row.get("epsEstimate")) else None,
                    "eps_actual": float(row.get("epsActual", 0)) if pd.notna(row.get("epsActual")) else None,
                    "surprise_pct": float(row.get("surprisePercent", 0)) if pd.notna(row.get("surprisePercent")) else None,
                })
            result["earnings_track"] = records

            # Streak de beats consécutifs
            beats = 0
            for r in reversed(records):
                if r["surprise_pct"] is not None and r["surprise_pct"] > 0:
                    beats += 1
                else:
                    break
            result["earnings_beat_streak"] = beats
        else:
            result["earnings_track"] = []
            result["earnings_beat_streak"] = 0
    except Exception as e:
        logger.debug(f"Deep profile {ticker}: earnings_history indispo: {e}")
        result["earnings_track"] = []
        result["earnings_beat_streak"] = 0

    # ── Financial statements (3 dernières années) ─────────────────────────
    def _df_to_dict(df: pd.DataFrame) -> dict:
        """Convertit un DataFrame yfinance (colonnes = dates) en dict lisible."""
        if df is None or df.empty:
            return {}
        out = {}
        for col in df.columns[:3]:  # 3 dernières années max
            year_label = str(col)[:4] if hasattr(col, 'strftime') else str(col)[:4]
            out[year_label] = {
                str(idx): (float(val) if pd.notna(val) else None)
                for idx, val in df[col].items()
            }
        return out

    try:
        result["financials"] = {
            "income_stmt": _df_to_dict(stock.income_stmt),
            "balance_sheet": _df_to_dict(stock.balance_sheet),
            "cashflow": _df_to_dict(stock.cashflow),
        }
    except Exception as e:
        logger.debug(f"Deep profile {ticker}: financial statements indispo: {e}")
        result["financials"] = {"income_stmt": {}, "balance_sheet": {}, "cashflow": {}}

    # ── Governance ────────────────────────────────────────────────────────
    result["governance"] = {
        "audit_risk": info.get("auditRisk"),
        "board_risk": info.get("boardRisk"),
        "compensation_risk": info.get("compensationRisk"),
        "shareholder_rights_risk": info.get("shareHolderRightsRisk"),
        "overall_risk": info.get("overallRisk"),
    }

    # ── Short interest ────────────────────────────────────────────────────
    result["short_interest"] = {
        "short_ratio": info.get("shortRatio"),
        "short_pct_of_float": info.get("shortPercentOfFloat"),
        "shares_short": info.get("sharesShort"),
        "shares_short_prior_month": info.get("sharesShortPriorMonth"),
        "date_short_interest": str(info.get("dateShortInterest", ""))[:10] if info.get("dateShortInterest") else None,
    }

    _cache_set(key, result)
    return result


def get_institutional_holders(ticker: str, top_n: int = 10) -> dict:
    """
    Top détenteurs institutionnels via yfinance (BlackRock, Vanguard, etc.).
    Inclut le pctChange Q/Q quand dispo (signal d'accumulation/désinvestissement).

    Retourne {
        "ticker": "EOSE",
        "report_date": "2025-12-31",
        "pct_insiders": 0.012,   # part des initiés
        "pct_institutions": 0.525,
        "holders": [{name, pct_held, shares, value, pct_change_qoq}, ...]
    }
    """
    key = ("institutional_holders", ticker.upper(), top_n)
    cached = _cache_get(key, 3600)  # 1h : données trimestrielles, peu volatiles
    if cached is not None:
        return cached

    result: dict = {
        "ticker": ticker.upper(),
        "report_date": None,
        "pct_insiders": None,
        "pct_institutions": None,
        "holders": [],
    }
    try:
        stock = yf.Ticker(ticker)

        # Major holders : pourcentages globaux insiders/institutions
        try:
            mh = stock.major_holders
            if mh is not None and not mh.empty:
                # Le DataFrame a un index "Breakdown" et une col "Value"
                vals = mh["Value"].to_dict() if "Value" in mh.columns else {}
                result["pct_insiders"] = _to_float_safe(vals.get("insidersPercentHeld"))
                result["pct_institutions"] = _to_float_safe(vals.get("institutionsPercentHeld"))
        except Exception:
            pass

        # Top holders détaillés
        ih = stock.institutional_holders
        if ih is not None and not ih.empty:
            for _, row in ih.head(top_n).iterrows():
                date_reported = row.get("Date Reported")
                if result["report_date"] is None and date_reported is not None:
                    try:
                        result["report_date"] = str(date_reported)[:10]
                    except Exception:
                        pass
                result["holders"].append({
                    "name": str(row.get("Holder", "")).strip(),
                    "pct_held": _to_float_safe(row.get("pctHeld")),
                    "shares": int(row.get("Shares", 0) or 0),
                    "value": _to_float_safe(row.get("Value")),
                    "pct_change_qoq": _to_float_safe(row.get("pctChange")),
                })
    except Exception as e:
        logger.debug(f"Holders {ticker} indispo: {e}")

    _cache_set(key, result)
    return result


def _to_float_safe(v) -> Optional[float]:
    if v is None:
        return None
    try:
        f = float(v)
        if f != f:  # NaN
            return None
        return f
    except (TypeError, ValueError):
        return None


def search_ticker(query: str) -> list[dict]:
    """
    Recherche de tickers par nom ou symbole.
    yfinance n'a pas de search native propre —
    on utilise yf.Ticker directement et on vérifie si les données existent.
    """
    results = []
    # Essai direct avec le query comme ticker
    ticker = query.upper().strip()
    info = get_company_info(ticker)
    if info:
        results.append({
            "ticker": ticker,
            "name": info.get("longName") or info.get("shortName", ticker),
            "exchange": info.get("exchange"),
            "sector": info.get("sector"),
        })
    return results
