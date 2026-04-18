"""
Routes : entreprises et analyses
  GET  /companies/search?q=AAPL       → recherche ticker
  GET  /companies/{ticker}            → info complète + fondamentaux
  GET  /companies/{ticker}/price      → prix et variations
  GET  /companies/{ticker}/scores     → scores calculés
  GET  /companies/{ticker}/brief      → note courte orientée décision
  GET  /companies/{ticker}/news       → news récentes
  POST /companies/{ticker}/sync       → rafraîchir les données depuis yfinance
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from datetime import datetime

from app.database import get_session
from app.models import Company
from app.services import data_service, scoring, brief_service
from app.services.scanner import get_competitors

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("/search")
async def search_company(q: str, session: AsyncSession = Depends(get_session)):
    """
    Recherche une entreprise par ticker.
    Cherche d'abord en DB, puis interroge yfinance si absente.
    """
    if not q or len(q) < 1:
        raise HTTPException(400, "Paramètre q requis")

    ticker = q.upper().strip()

    # 1. Cherche en base
    result = await session.exec(select(Company).where(Company.ticker == ticker))
    company = result.first()
    if company:
        return {"source": "database", "company": company}

    # 2. Interroge yfinance
    info = data_service.get_company_info(ticker)
    if not info:
        raise HTTPException(404, f"Ticker '{ticker}' introuvable")

    return {
        "source": "yfinance",
        "company": {
            "ticker": ticker,
            "name": info.get("longName") or info.get("shortName", ticker),
            "exchange": info.get("exchange"),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "country": info.get("country"),
            "currency": info.get("currency"),
            "market_cap": info.get("marketCap"),
        }
    }


@router.post("/{ticker}/sync")
async def sync_company(ticker: str, session: AsyncSession = Depends(get_session)):
    """
    Crée ou met à jour une entreprise en DB depuis yfinance.
    À appeler une fois avant de pouvoir utiliser les autres routes.
    """
    ticker = ticker.upper()
    info = data_service.get_company_info(ticker)
    if not info:
        raise HTTPException(404, f"Ticker '{ticker}' introuvable sur yfinance")

    # Cherche en base
    result = await session.exec(select(Company).where(Company.ticker == ticker))
    company = result.first()

    if company:
        # Mise à jour
        company.name = info.get("longName") or info.get("shortName", ticker)
        company.exchange = info.get("exchange")
        company.sector = info.get("sector")
        company.industry = info.get("industry")
        company.country = info.get("country")
        company.currency = info.get("currency")
        company.market_cap = info.get("marketCap")
        company.website = info.get("website")
        company.description = info.get("longBusinessSummary")
        company.last_updated = datetime.utcnow()
        action = "updated"
    else:
        # Création
        company = Company(
            ticker=ticker,
            name=info.get("longName") or info.get("shortName", ticker),
            exchange=info.get("exchange"),
            sector=info.get("sector"),
            industry=info.get("industry"),
            country=info.get("country"),
            currency=info.get("currency"),
            market_cap=info.get("marketCap"),
            website=info.get("website"),
            description=info.get("longBusinessSummary"),
            last_updated=datetime.utcnow(),
        )
        session.add(company)
        action = "created"

    await session.commit()
    await session.refresh(company)
    return {"action": action, "company": company}


@router.get("/{ticker}")
async def get_company(ticker: str, session: AsyncSession = Depends(get_session)):
    """Info complète d'une entreprise (DB + yfinance en temps réel)."""
    ticker = ticker.upper()
    result = await session.exec(select(Company).where(Company.ticker == ticker))
    company = result.first()

    info = data_service.get_company_info(ticker)
    if not info and not company:
        raise HTTPException(404, f"Ticker '{ticker}' introuvable")

    return {
        "company": company,
        "live_info": {
            "name": info.get("longName") or info.get("shortName"),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "description": info.get("longBusinessSummary"),
            "employees": info.get("fullTimeEmployees"),
            "website": info.get("website"),
        } if info else None
    }


@router.get("/{ticker}/price")
async def get_price(ticker: str):
    """Prix actuel + variations multi-horizons."""
    ticker = ticker.upper()
    changes = data_service.get_price_changes(ticker)
    if not changes:
        raise HTTPException(404, f"Prix indisponible pour '{ticker}'")
    return {"ticker": ticker, **changes}


@router.get("/{ticker}/fundamentals")
async def get_fundamentals(ticker: str):
    """Ratios fondamentaux depuis yfinance."""
    ticker = ticker.upper()
    fundamentals = data_service.get_fundamentals(ticker)
    if not fundamentals:
        raise HTTPException(404, f"Données fondamentales indisponibles pour '{ticker}'")
    return {"ticker": ticker, "fundamentals": fundamentals}


@router.get("/{ticker}/scores")
async def get_scores(ticker: str):
    """
    Scores calculés + justifications.
    Chaque score est entre 0 et 10, avec les raisons détaillées.
    """
    ticker = ticker.upper()
    fundamentals = data_service.get_fundamentals(ticker)
    changes = data_service.get_price_changes(ticker)

    if not fundamentals and not changes:
        raise HTTPException(404, f"Données indisponibles pour '{ticker}'")

    scores = scoring.compute_all_scores(fundamentals, changes)
    return {
        "ticker": ticker,
        "scores": scores,
        "composite_label": scoring.get_score_label(scores["composite"]),
    }


@router.get("/{ticker}/brief")
async def get_company_brief(ticker: str):
    """
    Note courte orientée décision.
    Synthèse en quelques lignes : pourquoi maintenant, action suggérée, risques.
    """
    ticker = ticker.upper()
    brief = brief_service.generate_company_brief(ticker)
    return brief


@router.get("/{ticker}/news")
async def get_news(ticker: str, count: int = 10):
    """News récentes depuis Yahoo Finance."""
    ticker = ticker.upper()
    news = data_service.get_news(ticker, count=min(count, 20))
    return {"ticker": ticker, "count": len(news), "news": news}


@router.get("/{ticker}/history")
async def get_history(ticker: str, period: str = "1y"):
    """
    Historique OHLCV.
    period : "1mo", "3mo", "6mo", "1y", "2y", "5y", "ytd"
    """
    valid_periods = ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "ytd", "max"]
    if period not in valid_periods:
        raise HTTPException(400, f"period doit être parmi : {valid_periods}")

    ticker = ticker.upper()
    df = data_service.get_price_history(ticker, period=period)
    if df.empty:
        raise HTTPException(404, f"Historique indisponible pour '{ticker}'")

    # Convertir en liste de dicts JSON-sérialisable
    df = df.reset_index()
    df["Date"] = df["Date"].astype(str)
    records = df[["Date", "Open", "High", "Low", "Close", "Volume"]].to_dict(orient="records")
    return {"ticker": ticker, "period": period, "data": records}


@router.get("/{ticker}/competitors")
async def get_ticker_competitors(ticker: str):
    """
    Retourne les concurrents du même secteur dans l'univers scanné,
    avec leurs prix, variations et scores pour comparaison rapide.
    """
    ticker = ticker.upper()
    comp_tickers = get_competitors(ticker)

    if not comp_tickers:
        return {"ticker": ticker, "competitors": [], "sector": None}

    # Identifier le secteur
    from app.services.scanner import SCAN_UNIVERSE
    sector = None
    for s, tickers in SCAN_UNIVERSE.items():
        if ticker in tickers:
            sector = s
            break

    competitors = []
    for ct in comp_tickers:
        try:
            changes = data_service.get_price_changes(ct)
            fundamentals = data_service.get_fundamentals(ct)
            scores = scoring.compute_all_scores(fundamentals, changes)
            info = data_service.get_company_info(ct)
            competitors.append({
                "ticker": ct,
                "name": info.get("longName") or info.get("shortName") or ct,
                "current_price": changes.get("current_price"),
                "change_1d": changes.get("change_1d"),
                "change_1m": changes.get("change_1m"),
                "change_ytd": changes.get("change_ytd"),
                "composite_score": scores["composite"],
                "quality_score": scores["quality"]["score"],
                "valuation_score": scores["valuation"]["score"],
            })
        except Exception:
            competitors.append({"ticker": ct, "name": ct, "error": True})

    competitors.sort(key=lambda c: c.get("composite_score", 0), reverse=True)
    return {"ticker": ticker, "sector": sector, "competitors": competitors}
