"""
Point d'entrée de l'API FastAPI.

Pour lancer en local :
  uvicorn app.main:app --reload

Documentation auto disponible sur :
  http://localhost:8000/docs   (Swagger UI)
  http://localhost:8000/redoc  (ReDoc)
"""
from dotenv import load_dotenv
load_dotenv()  # Charge api/.env (FINNHUB_API_KEY, etc.) avant les imports

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.database import init_db
from app.config import get_settings
from app.routers import companies, watchlist, portfolio, ideas, brief, scanner, chat, earnings, alerts, risk, analyst, news
from app.services.scanner import trigger_background_scan
from app.services.rss_aggregator import trigger_background_refresh as trigger_news_refresh
from app.services.finnhub_calendar import trigger_background_refresh as trigger_finnhub_refresh, is_configured as finnhub_configured

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
    # Premier scan en background — cache prêt ~60s après démarrage
    trigger_background_scan(max_results=10)
    logger.info("Scanner: premier scan lancé en background.")
    trigger_news_refresh()
    logger.info("RSS aggregator: premier fetch lancé en background.")
    if finnhub_configured():
        trigger_finnhub_refresh(max_days=30)
        logger.info("Finnhub calendar: premier fetch lancé en background.")
    else:
        logger.info("Finnhub calendar: clé non configurée, fallback sur SCAN_UNIVERSE.")
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
_cors_origins = [
    "http://localhost:3000", "http://127.0.0.1:3000",
    "http://localhost:3001", "http://127.0.0.1:3001",
    "http://localhost:3002", "http://127.0.0.1:3002",
]
if settings.allowed_origins:
    _cors_origins += [o.strip() for o in settings.allowed_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Cache HTTP léger : stale-while-revalidate ─────────────────────────────
# Le navigateur réutilise la donnée stale instantanément (zéro attente)
# tout en rafraîchissant en arrière-plan. Idéal pour un dashboard.
_CACHEABLE_PREFIXES = (
    "/brief", "/news/", "/earnings", "/alerts", "/watchlists",
    "/portfolio", "/ideas", "/scanner/opportunities",
    "/companies/",  # historique, fundamentals, etc.
)

@app.middleware("http")
async def add_cache_headers(request: Request, call_next):
    response = await call_next(request)
    if request.method == "GET" and any(request.url.path.startswith(p) for p in _CACHEABLE_PREFIXES):
        # 10s frais, puis 5 min de stale-while-revalidate (refresh en background)
        response.headers["Cache-Control"] = "private, max-age=10, stale-while-revalidate=300"
    return response

# Enregistrement des routes
app.include_router(companies.router)
app.include_router(watchlist.router)
app.include_router(portfolio.router)
app.include_router(ideas.router)
app.include_router(brief.router)
app.include_router(scanner.router)
app.include_router(chat.router)
app.include_router(earnings.router)
app.include_router(alerts.router)
app.include_router(risk.router)
app.include_router(analyst.router)
app.include_router(news.router)


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
