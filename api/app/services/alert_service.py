"""
Service d'alertes — vérifie et déclenche les alertes utilisateur.

Les alertes sont stockées en DB (modèle Alert) et vérifiées
lors de la génération du brief ou manuellement.
Types supportés : price_above, price_below, change_pct, earnings.
"""
import logging
from datetime import datetime, date
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import Alert, Company
from app.services.data_service import get_current_price, get_price_changes, get_earnings_calendar

logger = logging.getLogger(__name__)


async def check_alerts(session: AsyncSession) -> list[dict]:
    """
    Vérifie toutes les alertes actives non déclenchées.
    Retourne la liste des alertes nouvellement déclenchées.
    """
    result = await session.exec(
        select(Alert, Company)
        .join(Company, Company.id == Alert.company_id)
        .where(Alert.active == True, Alert.triggered == False)  # noqa: E712
    )
    alerts = result.all()
    triggered = []

    for alert, company in alerts:
        try:
            should_trigger = False
            message = alert.message or ""

            if alert.type == "price_above":
                price = get_current_price(company.ticker)
                if price and alert.condition_value and price >= alert.condition_value:
                    should_trigger = True
                    message = message or f"{company.ticker} a franchi {alert.condition_value:.2f} (prix actuel : {price:.2f})"

            elif alert.type == "price_below":
                price = get_current_price(company.ticker)
                if price and alert.condition_value and price <= alert.condition_value:
                    should_trigger = True
                    message = message or f"{company.ticker} est passé sous {alert.condition_value:.2f} (prix actuel : {price:.2f})"

            elif alert.type == "change_pct":
                changes = get_price_changes(company.ticker)
                change_1d = changes.get("change_1d")
                if change_1d is not None and alert.condition_value is not None:
                    if abs(change_1d) >= abs(alert.condition_value):
                        should_trigger = True
                        message = message or f"{company.ticker} a bougé de {change_1d:+.2f}% aujourd'hui (seuil : {alert.condition_value}%)"

            elif alert.type == "earnings":
                cal = get_earnings_calendar(company.ticker)
                earnings_str = cal.get("earnings_date")
                if earnings_str and str(earnings_str) != "None":
                    earnings_dt = date.fromisoformat(str(earnings_str)[:10])
                    days_until = (earnings_dt - date.today()).days
                    threshold = int(alert.condition_value or 7)
                    if 0 <= days_until <= threshold:
                        should_trigger = True
                        message = message or f"{company.ticker} publie ses résultats dans {days_until} jours ({earnings_dt.strftime('%d/%m')})"

            if should_trigger:
                alert.triggered = True
                alert.triggered_at = datetime.utcnow()
                alert.message = message
                session.add(alert)
                triggered.append({
                    "id": alert.id,
                    "ticker": company.ticker,
                    "type": alert.type,
                    "message": message,
                    "triggered_at": datetime.utcnow().isoformat(),
                })

        except Exception as e:
            logger.warning(f"Alert check {company.ticker}: {e}")
            continue

    if triggered:
        await session.commit()

    return triggered


async def create_alert(
    session: AsyncSession,
    company_id: int,
    alert_type: str,
    condition_value: float | None = None,
    message: str | None = None,
) -> Alert:
    """Crée une nouvelle alerte."""
    alert = Alert(
        company_id=company_id,
        type=alert_type,
        condition_value=condition_value,
        message=message,
    )
    session.add(alert)
    await session.commit()
    await session.refresh(alert)
    return alert
