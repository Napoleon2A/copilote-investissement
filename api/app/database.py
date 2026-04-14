from sqlmodel import SQLModel
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession
from app.config import get_settings

settings = get_settings()

# Moteur SQLite asynchrone — crée le fichier trading.db automatiquement
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    connect_args={"check_same_thread": False},
)

# On utilise AsyncSession de SQLModel (pas SQLAlchemy) pour avoir session.exec()
AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def init_db():
    """Crée toutes les tables au démarrage si elles n'existent pas."""
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)


async def get_session():
    """Dépendance FastAPI — injecte une session DB dans chaque route."""
    async with AsyncSessionLocal() as session:
        yield session
