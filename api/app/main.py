"""
Point d'entrée de l'API FastAPI.

Pour lancer en local :
  uvicorn app.main:app --reload

Documentation auto disponible sur :
  http://localhost:8000/docs   (Swagger UI)
  http://localhost:8000/redoc  (ReDoc)
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.database import init_db
from app.config import get_settings
from app.routers import companies, watchlist, portfolio, ideas, brief

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialisation au démarrage : création des tables si nécessaire."""
    logger.info("Démarrage — initialisation de la base de données...")
    await init_db()
    logger.info("Base de données prête.")
    yield
    logger.info("Arrêt de l'API.")


app = FastAPI(
    title=settings.app_name,
    description="""
## Copilote Investissement — API

API REST du système de suivi et d'aide à la décision en investissement.

### Modules disponibles
- **companies** : recherche, infos, scores, notes courtes
- **watchlists** : gestion des listes de suivi
- **portfolio** : positions, P&L, thèses d'investissement
- **ideas** : idées soumises par l'utilisateur avec avis révisables
- **brief** : brief quotidien orienté décision

### Important
Toutes les données de marché proviennent de yfinance (délai 15 min pour les US).
Ce système est à usage personnel. Ce n'est pas un conseil en investissement.
    """,
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — origines autorisées : localhost en local + origines prod via env
_cors_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
if settings.allowed_origins:
    _cors_origins += [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enregistrement des routes
app.include_router(companies.router)
app.include_router(watchlist.router)
app.include_router(portfolio.router)
app.include_router(ideas.router)
app.include_router(brief.router)


@app.get("/", tags=["health"])
async def root():
    return {
        "status": "ok",
        "app": settings.app_name,
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/health", tags=["health"])
async def health():
    return {"status": "healthy"}
