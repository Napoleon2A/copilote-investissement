from fastapi import APIRouter, Depends
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.database import get_session
from app.models import Position, Portfolio, WatchlistItem, Company, UserIdea
from app.services.brief_service import generate_daily_brief

router = APIRouter(prefix="/brief", tags=["brief"])


@router.get("")
async def get_daily_brief(session: AsyncSession = Depends(get_session)):
    """
    Brief quotidien — la sortie principale du système.

    Agrège :
      - Les positions du portefeuille (priorité max)
      - Les tickers des watchlists actives
      - Les idées en attente de suivi

    Retourne 3 à 7 items maximum, triés par priorité.
    """
    # Tickers du portefeuille
    portfolio_result = await session.exec(select(Portfolio))
    portfolio = portfolio_result.first()

    portfolio_tickers = []
    if portfolio:
        pos_result = await session.exec(
            select(Company)
            .join(Position, Position.company_id == Company.id)
            .where(Position.portfolio_id == portfolio.id)
        )
        portfolio_tickers = [company.ticker for company in pos_result.all()]

    # Tickers des watchlists
    wl_result = await session.exec(
        select(Company)
        .join(WatchlistItem, WatchlistItem.company_id == Company.id)
    )
    watchlist_tickers = list({company.ticker for company in wl_result.all()})

    # Tickers des idées utilisateur
    idea_result = await session.exec(
        select(Company)
        .join(UserIdea, UserIdea.company_id == Company.id)
    )
    idea_tickers = list({company.ticker for company in idea_result.all()})

    brief = generate_daily_brief(
        portfolio_tickers=portfolio_tickers,
        watchlist_tickers=watchlist_tickers,
        idea_tickers=idea_tickers,
        max_items=7,
    )
    return brief
