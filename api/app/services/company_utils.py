"""
Utilitaire partagé — get_or_create_company

Factorise le pattern "chercher dans la DB, sinon créer via yfinance"
qui était dupliqué dans ideas.py, portfolio.py, watchlist.py, companies.py.
"""
from datetime import datetime
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import Company
from app.services import data_service


async def get_or_create_company(session: AsyncSession, ticker: str) -> Company:
    """
    Retourne la Company existante ou en crée une nouvelle via yfinance.
    Le ticker est toujours normalisé en majuscules.
    """
    ticker = ticker.upper()
    result = await session.exec(select(Company).where(Company.ticker == ticker))
    company = result.first()

    if company:
        return company

    info = data_service.get_company_info(ticker)
    company = Company(
        ticker=ticker,
        name=info.get("longName") or info.get("shortName") or ticker,
        exchange=info.get("exchange"),
        sector=info.get("sector"),
        industry=info.get("industry"),
        country=info.get("country"),
        currency=info.get("currency"),
        last_updated=datetime.utcnow(),
    )
    session.add(company)
    await session.flush()
    return company
