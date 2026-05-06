"""
Routes : Opérations court terme (earnings trades) — workflow prompt clipboard.

  GET  /earnings-trade/prompt        → mégaprompt à coller dans claude.ai
  POST /earnings-trade/import        → parse + crée les trades depuis la réponse collée
  GET  /earnings-trade/active        → trades pending/triggered (pour la home + page)
  GET  /earnings-trade/all           → liste complète (avec closed/missed)
  PATCH /earnings-trade/{id}         → MAJ statut + notes
"""
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services import earnings_trade_service as ets

router = APIRouter(prefix="/earnings-trade", tags=["earnings-trade"])


class ImportPayload(BaseModel):
    response_text: str


class StatusUpdatePayload(BaseModel):
    status: str
    notes: Optional[str] = None


@router.get("/prompt")
async def get_prompt(days_ahead: int = Query(default=14, ge=3, le=30)):
    """
    Génère le mégaprompt earnings-trade à copier-coller dans claude.ai.
    Liste les tickers de portfolio + idées + opps qui ont des earnings dans
    les `days_ahead` jours.
    """
    return await ets.build_earnings_trade_prompt(days_ahead=days_ahead)


@router.post("/import")
async def import_response(payload: ImportPayload):
    """Importe une réponse claude.ai et crée les EarningsTrade en DB."""
    if not payload.response_text or len(payload.response_text) < 50:
        raise HTTPException(status_code=400, detail="Réponse trop courte ou vide.")
    return await ets.import_pasted_response(payload.response_text)


@router.get("/active")
async def list_active(limit: int = Query(default=20, ge=1, le=100)):
    """Trades pending ou triggered, triés par earnings_date croissant."""
    trades = await ets.list_trades(active_only=True, limit=limit)
    return {"count": len(trades), "trades": trades}


@router.get("/all")
async def list_all(limit: int = Query(default=100, ge=1, le=500)):
    """Liste complète (incluant closed/missed) pour historique."""
    trades = await ets.list_trades(active_only=False, limit=limit)
    return {"count": len(trades), "trades": trades}


@router.patch("/{trade_id}")
async def update_trade(trade_id: int, payload: StatusUpdatePayload):
    """Mise à jour du statut (triggered/closed_win/closed_loss/missed) + notes."""
    ok = await ets.update_trade_status(trade_id, payload.status, payload.notes)
    if not ok:
        raise HTTPException(status_code=400, detail="Trade introuvable ou statut invalide.")
    return {"ok": True, "id": trade_id, "status": payload.status}
