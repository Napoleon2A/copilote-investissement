"""
Conviction Tracker — mesure la précision du système dans le temps.

Enregistre chaque prédiction (scan, idée, brief) avec le prix et le score
au moment de la recommandation. Résout les prédictions après 1W/1M/3M
en comparant le prix réel au prix de recommandation.
"""
import logging
from datetime import datetime, timedelta
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import Prediction
from app.services.data_service import get_current_price

logger = logging.getLogger(__name__)


async def record_prediction(
    session: AsyncSession,
    ticker: str,
    score: float,
    price: float,
    action: str,
    source: str,
) -> Prediction:
    """Enregistre une nouvelle prédiction."""
    pred = Prediction(
        ticker=ticker,
        source=source,
        score_at_prediction=score,
        price_at_prediction=price,
        predicted_action=action,
    )
    session.add(pred)
    await session.commit()
    return pred


async def resolve_predictions(session: AsyncSession) -> int:
    """
    Résout les prédictions non résolues en vérifiant les prix actuels.
    Met à jour price_1w, price_1m, price_3m selon l'ancienneté.
    Marque comme résolue quand les 3 horizons sont remplis.

    Returns: nombre de prédictions mises à jour.
    """
    now = datetime.utcnow()
    result = await session.exec(
        select(Prediction).where(Prediction.resolved == False)  # noqa: E712
    )
    predictions = result.all()
    updated = 0

    for pred in predictions:
        age = now - pred.created_at
        current = get_current_price(pred.ticker)
        if not current:
            continue

        changed = False

        # 1 semaine (7 jours)
        if pred.price_1w is None and age >= timedelta(days=7):
            pred.price_1w = current
            changed = True

        # 1 mois (30 jours)
        if pred.price_1m is None and age >= timedelta(days=30):
            pred.price_1m = current
            changed = True

        # 3 mois (90 jours)
        if pred.price_3m is None and age >= timedelta(days=90):
            pred.price_3m = current
            changed = True

        # Résolu quand tous les horizons sont remplis
        if pred.price_1w and pred.price_1m and pred.price_3m:
            pred.resolved = True

        if changed:
            session.add(pred)
            updated += 1

    if updated:
        await session.commit()
    return updated


async def get_accuracy_stats(session: AsyncSession) -> dict:
    """
    Calcule les statistiques de précision du système.

    Win = le prix a monté quand l'action recommandée était "buy_small" ou "read".
    Loss = le prix a baissé pour ces mêmes actions.
    """
    result = await session.exec(select(Prediction))
    all_preds = result.all()

    if not all_preds:
        return {"total_predictions": 0, "message": "Pas encore de données"}

    total = len(all_preds)
    buy_actions = {"buy_small", "read", "buy_before"}

    # Stats sur les prédictions avec prix à 1 semaine
    resolved_1w = [p for p in all_preds if p.price_1w is not None]
    wins_1w = sum(
        1 for p in resolved_1w
        if p.predicted_action in buy_actions and p.price_1w > p.price_at_prediction
    )
    total_buy_1w = sum(1 for p in resolved_1w if p.predicted_action in buy_actions)

    # Stats sur les prédictions avec prix à 1 mois
    resolved_1m = [p for p in all_preds if p.price_1m is not None]
    wins_1m = sum(
        1 for p in resolved_1m
        if p.predicted_action in buy_actions and p.price_1m > p.price_at_prediction
    )
    total_buy_1m = sum(1 for p in resolved_1m if p.predicted_action in buy_actions)

    # Retour moyen
    avg_return_1w = 0
    if resolved_1w:
        returns = [(p.price_1w - p.price_at_prediction) / p.price_at_prediction * 100
                   for p in resolved_1w if p.price_at_prediction > 0]
        avg_return_1w = sum(returns) / len(returns) if returns else 0

    avg_return_1m = 0
    if resolved_1m:
        returns = [(p.price_1m - p.price_at_prediction) / p.price_at_prediction * 100
                   for p in resolved_1m if p.price_at_prediction > 0]
        avg_return_1m = sum(returns) / len(returns) if returns else 0

    return {
        "total_predictions": total,
        "stats_1w": {
            "resolved": len(resolved_1w),
            "buy_signals": total_buy_1w,
            "wins": wins_1w,
            "win_rate": round(wins_1w / total_buy_1w * 100, 1) if total_buy_1w > 0 else None,
            "avg_return_pct": round(avg_return_1w, 2),
        },
        "stats_1m": {
            "resolved": len(resolved_1m),
            "buy_signals": total_buy_1m,
            "wins": wins_1m,
            "win_rate": round(wins_1m / total_buy_1m * 100, 1) if total_buy_1m > 0 else None,
            "avg_return_pct": round(avg_return_1m, 2),
        },
        "by_source": _stats_by_source(all_preds),
    }


def _stats_by_source(preds: list[Prediction]) -> dict:
    """Ventilation par source (scan, idea, brief)."""
    sources: dict[str, int] = {}
    for p in preds:
        sources[p.source] = sources.get(p.source, 0) + 1
    return sources
