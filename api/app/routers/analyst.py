"""
Router Analyst — Endpoints pour l'analyse deep Claude API.

Tous les endpoints nécessitent une action manuelle (POST) — jamais d'appel
automatique au chargement de page. Budget hard-cap 3$/mois.
"""
from fastapi import APIRouter, HTTPException
from datetime import datetime, timedelta
import logging
import json

router = APIRouter(prefix="/analyst", tags=["analyst"])
logger = logging.getLogger(__name__)


@router.post("/analyze/{ticker}")
async def analyze_ticker(ticker: str):
    """
    Lance une analyse deep d'un ticker via Claude API.
    Vérifie d'abord le cache (7 jours) avant de consommer du budget.
    POST uniquement — jamais appelé au chargement de page.
    """
    from app.services.investment_analyst import generate_investment_thesis, get_cached_analysis

    ticker = ticker.upper().strip()
    if not ticker or len(ticker) > 20:
        raise HTTPException(status_code=400, detail="Ticker invalide")

    # Vérifier le cache d'abord
    try:
        cached = await get_cached_analysis(ticker)
        if cached:
            cached["from_cache"] = True
            return cached
    except Exception as e:
        logger.warning(f"Erreur lecture cache pour {ticker}: {e}")

    # Générer une nouvelle analyse
    try:
        result = await generate_investment_thesis(ticker)
        result["from_cache"] = False
        return result
    except ValueError as e:
        # API key manquante ou configuration
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        error_name = type(e).__name__
        if error_name == "BudgetExceededError":
            raise HTTPException(
                status_code=429,
                detail=f"Budget mensuel atteint. {str(e)}"
            )
        logger.error(f"Erreur analyse {ticker}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de l'analyse: {str(e)}"
        )


@router.post("/run-weekly")
async def run_weekly():
    """
    Lance la sélection hebdomadaire des meilleures thèses.
    POST uniquement — confirmation utilisateur requise côté frontend.
    Coût estimé : ~0.85$.
    """
    from app.services.investment_analyst import run_weekly_selection

    try:
        result = await run_weekly_selection()
        return result
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        error_name = type(e).__name__
        if error_name == "BudgetExceededError":
            raise HTTPException(
                status_code=429,
                detail=f"Budget mensuel atteint. {str(e)}"
            )
        logger.error(f"Erreur sélection hebdo: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Erreur lors de la sélection: {str(e)}"
        )


@router.get("/weekly-selection")
async def get_weekly_selection():
    """
    Retourne la dernière sélection hebdomadaire (lecture seule, pas d'appel API).
    Peut être appelé au chargement de page sans souci.
    """
    from app.database import engine
    from sqlmodel.ext.asyncio.session import AsyncSession
    from sqlmodel import select
    from app.models import WeeklySelection, InvestmentAnalysis

    try:
        async with AsyncSession(engine) as session:
            # Dernière sélection
            stmt = select(WeeklySelection).order_by(
                WeeklySelection.generated_at.desc()
            ).limit(1)
            result = await session.exec(stmt)
            selection = result.first()

            if not selection:
                return {"selection": None, "theses": []}

            # Récupérer les analyses pour chaque ticker
            tickers = json.loads(selection.tickers)
            theses = []
            for ticker in tickers:
                stmt = select(InvestmentAnalysis).where(
                    InvestmentAnalysis.ticker == ticker
                ).order_by(
                    InvestmentAnalysis.generated_at.desc()
                ).limit(1)
                result = await session.exec(stmt)
                analysis = result.first()
                if analysis:
                    theses.append({
                        "ticker": analysis.ticker,
                        "business_summary": analysis.business_summary,
                        "competitive_moat": analysis.competitive_moat,
                        "value_chain": analysis.value_chain,
                        "financial_dynamics": analysis.financial_dynamics,
                        "current_momentum": analysis.current_momentum,
                        "specific_risks": analysis.specific_risks,
                        "investment_thesis": analysis.investment_thesis,
                        "verdict_action": analysis.verdict_action,
                        "verdict_conviction": analysis.verdict_conviction,
                        "verdict_horizon": analysis.verdict_horizon,
                        "ideal_entry_price": analysis.ideal_entry_price,
                        "one_liner": analysis.one_liner,
                        "generated_at": analysis.generated_at.isoformat(),
                        "cost_usd": analysis.cost_usd,
                    })

            return {
                "selection": {
                    "week_start": str(selection.week_start),
                    "rationale": selection.selection_rationale,
                    "generated_at": selection.generated_at.isoformat(),
                },
                "theses": theses,
            }
    except Exception as e:
        logger.error(f"Erreur lecture sélection hebdo: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/budget")
async def get_budget():
    """
    Retourne l'état du budget Claude API pour le mois en cours.
    Lecture seule — peut être appelé au chargement de page.
    """
    from app.services.llm_service import get_budget_status

    try:
        status = await get_budget_status()
        return status
    except Exception as e:
        logger.error(f"Erreur lecture budget: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/prompt/weekly")
async def get_weekly_prompt():
    """
    Génère le prompt de sélection hebdomadaire pour copier-coller dans claude.ai.
    Scanne l'univers (gratuit), collecte les données des top 5, construit le prompt.
    Coût : 0€. Peut prendre ~30s (collecte yfinance pour 5 tickers).
    """
    from app.services.investment_analyst import generate_weekly_prompt_for_clipboard

    try:
        result = await generate_weekly_prompt_for_clipboard()
        return result
    except Exception as e:
        logger.error(f"Erreur génération prompt hebdo: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/prompt/{ticker}")
async def get_prompt(ticker: str):
    """
    Génère le prompt complet pour copier-coller dans claude.ai.
    Collecte les données gratuites, construit le prompt, retourne le texte.
    Coût : 0€. Peut être appelé autant de fois que nécessaire.
    """
    from app.services.investment_analyst import generate_prompt_for_clipboard

    ticker = ticker.upper().strip()
    if not ticker or len(ticker) > 20:
        raise HTTPException(status_code=400, detail="Ticker invalide")

    try:
        result = await generate_prompt_for_clipboard(ticker)
        return result
    except Exception as e:
        logger.error(f"Erreur génération prompt {ticker}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import/{ticker}")
async def import_analysis(ticker: str, body: dict):
    """
    Importe une analyse copiée-collée depuis claude.ai.
    Le body doit contenir {"analysis_text": "..."}.
    Parse le verdict, extrait les sections, stocke en DB.
    Coût : 0€.
    """
    from app.services.investment_analyst import import_pasted_analysis

    ticker = ticker.upper().strip()
    if not ticker or len(ticker) > 20:
        raise HTTPException(status_code=400, detail="Ticker invalide")

    analysis_text = body.get("analysis_text", "").strip()
    if not analysis_text or len(analysis_text) < 50:
        raise HTTPException(status_code=400, detail="Texte d'analyse trop court (min 50 caractères)")

    try:
        result = await import_pasted_analysis(ticker, analysis_text)
        return result
    except Exception as e:
        logger.error(f"Erreur import analyse {ticker}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/import-weekly")
async def import_weekly_analysis(body: dict):
    """
    Importe une sélection hebdomadaire copiée-collée depuis claude.ai.
    Le body doit contenir {"analysis_text": "...", "tickers": ["AAPL", ...]}.
    """
    from app.services.investment_analyst import import_pasted_weekly

    analysis_text = body.get("analysis_text", "").strip()
    tickers = body.get("tickers", [])

    if not analysis_text or len(analysis_text) < 50:
        raise HTTPException(status_code=400, detail="Texte d'analyse trop court")
    if not tickers:
        raise HTTPException(status_code=400, detail="Liste de tickers requise")

    try:
        result = await import_pasted_weekly(tickers, analysis_text)
        return result
    except Exception as e:
        logger.error(f"Erreur import sélection hebdo: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analysis/{ticker}")
async def get_analysis(ticker: str):
    """
    Retourne l'analyse existante d'un ticker (lecture seule).
    Ne déclenche PAS de nouvelle analyse — utiliser POST /analyst/analyze/{ticker} pour ça.
    """
    from app.services.investment_analyst import get_cached_analysis

    ticker = ticker.upper().strip()
    try:
        analysis = await get_cached_analysis(ticker)
        if not analysis:
            return {"analysis": None, "message": f"Aucune analyse disponible pour {ticker}"}
        return {"analysis": analysis}
    except Exception as e:
        logger.error(f"Erreur lecture analyse {ticker}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
