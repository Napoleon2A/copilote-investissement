"""
Routes : gestion du risque
  POST  /risk/position-size     → calculer la taille de position
  GET   /risk/stop-loss/{ticker} → niveaux de stop-loss suggérés
"""
from fastapi import APIRouter
from pydantic import BaseModel

from app.services.risk_manager import calculate_position_size, suggest_stop_loss

router = APIRouter(prefix="/risk", tags=["risk"])


class PositionSizeRequest(BaseModel):
    portfolio_value: float
    risk_pct: float         # ex: 1.0 = 1% du portefeuille
    entry_price: float
    stop_price: float


@router.post("/position-size")
async def calc_position_size(data: PositionSizeRequest):
    """
    Calcule combien d'actions acheter pour un risque donné.
    Méthode : risque fixe par trade (% du portefeuille).
    """
    return calculate_position_size(
        portfolio_value=data.portfolio_value,
        risk_pct=data.risk_pct,
        entry_price=data.entry_price,
        stop_price=data.stop_price,
    )


@router.get("/stop-loss/{ticker}")
async def get_stop_loss(ticker: str):
    """
    Suggère 3 niveaux de stop-loss (serré, modéré, large)
    basés sur la volatilité 52 semaines du titre.
    """
    return suggest_stop_loss(ticker.upper())
