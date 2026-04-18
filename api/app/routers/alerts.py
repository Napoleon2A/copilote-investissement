"""
Routes : alertes utilisateur
  POST   /alerts             → créer une alerte
  GET    /alerts             → lister les alertes actives
  GET    /alerts/triggered   → alertes récemment déclenchées
  POST   /alerts/check       → forcer la vérification
  DELETE /alerts/{id}        → désactiver une alerte
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from typing import Optional

from app.database import get_session
from app.models import Alert, Company
from app.services.alert_service import check_alerts, create_alert
from app.services.company_utils import get_or_create_company

router = APIRouter(prefix="/alerts", tags=["alerts"])


class AlertCreate(BaseModel):
    ticker: str
    type: str           # "price_above" | "price_below" | "change_pct" | "earnings"
    condition_value: Optional[float] = None
    message: Optional[str] = None


@router.post("")
async def create_new_alert(data: AlertCreate, session: AsyncSession = Depends(get_session)):
    """Crée une alerte sur un ticker."""
    valid_types = ["price_above", "price_below", "change_pct", "earnings"]
    if data.type not in valid_types:
        raise HTTPException(400, f"Type doit être parmi : {valid_types}")

    company = await get_or_create_company(session, data.ticker)
    alert = await create_alert(session, company.id, data.type, data.condition_value, data.message)
    return {"id": alert.id, "ticker": data.ticker, "type": data.type, "status": "active"}


@router.get("")
async def list_alerts(session: AsyncSession = Depends(get_session)):
    """Liste toutes les alertes actives."""
    result = await session.exec(
        select(Alert, Company)
        .join(Company, Company.id == Alert.company_id)
        .where(Alert.active == True)  # noqa: E712
    )
    alerts = []
    for alert, company in result.all():
        alerts.append({
            "id": alert.id,
            "ticker": company.ticker,
            "type": alert.type,
            "condition_value": alert.condition_value,
            "message": alert.message,
            "triggered": alert.triggered,
            "triggered_at": alert.triggered_at.isoformat() if alert.triggered_at else None,
            "created_at": alert.created_at.isoformat(),
        })
    return {"count": len(alerts), "alerts": alerts}


@router.get("/triggered")
async def list_triggered(session: AsyncSession = Depends(get_session)):
    """Liste les alertes récemment déclenchées."""
    result = await session.exec(
        select(Alert, Company)
        .join(Company, Company.id == Alert.company_id)
        .where(Alert.triggered == True)  # noqa: E712
        .order_by(Alert.triggered_at.desc())  # type: ignore
        .limit(20)
    )
    alerts = []
    for alert, company in result.all():
        alerts.append({
            "id": alert.id,
            "ticker": company.ticker,
            "type": alert.type,
            "message": alert.message,
            "triggered_at": alert.triggered_at.isoformat() if alert.triggered_at else None,
        })
    return {"count": len(alerts), "alerts": alerts}


@router.post("/check")
async def force_check(session: AsyncSession = Depends(get_session)):
    """Force la vérification de toutes les alertes actives."""
    triggered = await check_alerts(session)
    return {"checked": True, "newly_triggered": len(triggered), "alerts": triggered}


@router.delete("/{alert_id}")
async def deactivate_alert(alert_id: int, session: AsyncSession = Depends(get_session)):
    """Désactive une alerte."""
    result = await session.exec(select(Alert).where(Alert.id == alert_id))
    alert = result.first()
    if not alert:
        raise HTTPException(404, "Alerte introuvable")
    alert.active = False
    session.add(alert)
    await session.commit()
    return {"id": alert_id, "status": "deactivated"}
