"""
Service Claude API — interface entre l'app et Anthropic.

Gère le budget mensuel, le logging de chaque appel (réussis ET ratés),
et la communication avec l'API Claude via le SDK Python async.

Règles strictes :
- JAMAIS de retry automatique
- JAMAIS d'appel au chargement de page (uniquement via bouton + confirmation)
- Les appels ratés comptent dans le budget (l'input est facturé)
- Hard-cap mensuel configurable (défaut 3$/mois)
- Temperature 0 pour la reproductibilité
"""

import logging
from datetime import datetime, timezone

import anthropic
from sqlmodel import select, func
from sqlmodel.ext.asyncio.session import AsyncSession

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import LLMUsageLog

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Coûts par modèle (USD par million de tokens)
# ---------------------------------------------------------------------------
MODEL_PRICING: dict[str, dict[str, float]] = {
    "claude-sonnet-4-20250514": {"input": 3.0, "output": 15.0},
    "claude-haiku-3-20250414": {"input": 0.25, "output": 1.25},
}

# Fallback pour un modèle inconnu — on prend le tarif Sonnet (prudent)
_DEFAULT_PRICING: dict[str, float] = {"input": 3.0, "output": 15.0}


# ---------------------------------------------------------------------------
# Exceptions custom
# ---------------------------------------------------------------------------
class BudgetExceededError(Exception):
    """Le hard-cap mensuel serait dépassé par cet appel."""


class AnalysisError(Exception):
    """Erreur lors de l'appel à Claude (réseau, API, parsing…)."""


# ---------------------------------------------------------------------------
# Calcul de coût
# ---------------------------------------------------------------------------
def calculate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """
    Calcule le coût en USD d'un appel Claude.

    Formule : (input_tokens * prix_input / 1_000_000)
            + (output_tokens * prix_output / 1_000_000)
    """
    pricing = MODEL_PRICING.get(model, _DEFAULT_PRICING)
    cost = (
        input_tokens * pricing["input"] / 1_000_000
        + output_tokens * pricing["output"] / 1_000_000
    )
    return round(cost, 6)


# ---------------------------------------------------------------------------
# BudgetTracker — suivi budget mensuel via SQLite
# ---------------------------------------------------------------------------
class BudgetTracker:
    """Suit la dépense mensuelle Claude API et empêche de dépasser le hard-cap."""

    def __init__(self) -> None:
        settings = get_settings()
        self.hard_cap: float = settings.analyst_monthly_budget_usd

    async def get_monthly_spend(self) -> float:
        """Somme des cost_usd du mois en cours."""
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        async with AsyncSessionLocal() as session:
            statement = select(func.coalesce(func.sum(LLMUsageLog.cost_usd), 0.0)).where(
                LLMUsageLog.called_at >= month_start
            )
            result = await session.exec(statement)
            total: float = result.one()
            return round(total, 6)

    async def can_afford(self, estimated_cost: float) -> bool:
        """Vérifie si monthly_spend + estimated_cost reste sous le hard-cap."""
        current = await self.get_monthly_spend()
        return (current + estimated_cost) < self.hard_cap

    async def log_usage(
        self,
        purpose: str,
        ticker: str | None,
        model: str,
        input_tokens: int,
        output_tokens: int,
        cost_usd: float,
        success: bool,
        error_message: str | None = None,
    ) -> None:
        """Insère une ligne LLMUsageLog — appels réussis ET ratés."""
        log_entry = LLMUsageLog(
            purpose=purpose,
            ticker=ticker,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost_usd,
            success=success,
            error_message=error_message,
            called_at=datetime.now(timezone.utc),
        )
        async with AsyncSessionLocal() as session:
            session.add(log_entry)
            try:
                await session.commit()
            except Exception:
                await session.rollback()
                logger.exception("Échec du logging de l'appel LLM")


# Singleton — une seule instance suffit
budget_tracker = BudgetTracker()


# ---------------------------------------------------------------------------
# Fonction principale — appel Claude
# ---------------------------------------------------------------------------
async def analyze_with_claude(
    system_prompt: str,
    user_content: str,
    purpose: str = "deep_analysis",
    ticker: str | None = None,
    model: str = "claude-sonnet-4-20250514",
    max_tokens: int = 4000,
) -> dict:
    """
    Appelle l'API Claude et retourne le résultat avec le coût.

    Returns:
        {"content": str, "input_tokens": int, "output_tokens": int, "cost_usd": float}

    Raises:
        ValueError: si ANTHROPIC_API_KEY n'est pas configurée.
        BudgetExceededError: si l'appel ferait dépasser le hard-cap mensuel.
        AnalysisError: si l'appel API échoue (réseau, timeout, erreur Anthropic).
    """
    settings = get_settings()

    # --- Vérification clé API ---
    if not settings.anthropic_api_key:
        raise ValueError("ANTHROPIC_API_KEY non configurée")

    # --- Estimation du coût AVANT l'appel ---
    # Heuristique : ~4 caractères ≈ 1 token (conservateur)
    estimated_input_tokens = len(system_prompt + user_content) // 4
    estimated_output_tokens = max_tokens  # worst case
    estimated_cost = calculate_cost(model, estimated_input_tokens, estimated_output_tokens)

    if not await budget_tracker.can_afford(estimated_cost):
        monthly_spend = await budget_tracker.get_monthly_spend()
        raise BudgetExceededError(
            f"Budget mensuel dépassé : {monthly_spend:.4f}$ dépensés "
            f"sur {budget_tracker.hard_cap}$ autorisés. "
            f"Coût estimé de cet appel : {estimated_cost:.4f}$"
        )

    # --- Appel API ---
    client = anthropic.AsyncAnthropic(
        api_key=settings.anthropic_api_key,
        timeout=60.0,
    )

    try:
        logger.info(
            "Appel Claude API — model=%s, purpose=%s, ticker=%s",
            model, purpose, ticker,
        )

        response = await client.messages.create(
            model=model,
            max_tokens=max_tokens,
            temperature=0,
            system=system_prompt,
            messages=[{"role": "user", "content": user_content}],
        )

        input_tokens = response.usage.input_tokens
        output_tokens = response.usage.output_tokens
        cost = calculate_cost(model, input_tokens, output_tokens)
        content = response.content[0].text

        # Log succès
        await budget_tracker.log_usage(
            purpose=purpose,
            ticker=ticker,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost,
            success=True,
        )

        logger.info(
            "Claude API OK — %d input, %d output tokens, coût %.6f$",
            input_tokens, output_tokens, cost,
        )

        return {
            "content": content,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": cost,
        }

    except Exception as e:
        # Log échec — les input tokens sont facturés même en cas d'erreur
        # On utilise l'estimation car on n'a pas la réponse
        failure_cost = calculate_cost(model, estimated_input_tokens, 0)

        await budget_tracker.log_usage(
            purpose=purpose,
            ticker=ticker,
            model=model,
            input_tokens=estimated_input_tokens,
            output_tokens=0,
            cost_usd=failure_cost,
            success=False,
            error_message=str(e)[:500],
        )

        logger.error("Claude API ERREUR — %s: %s", type(e).__name__, e)
        raise AnalysisError(f"Échec de l'appel Claude : {e}") from e


# ---------------------------------------------------------------------------
# Statut budget
# ---------------------------------------------------------------------------
async def get_budget_status() -> dict:
    """
    Retourne l'état du budget mensuel.

    Returns:
        {
            "monthly_spend": float,
            "monthly_limit": float,
            "remaining": float,
            "month": str  # ex: "2026-04"
        }
    """
    spend = await budget_tracker.get_monthly_spend()
    now = datetime.now(timezone.utc)
    return {
        "monthly_spend": round(spend, 4),
        "monthly_limit": budget_tracker.hard_cap,
        "remaining": round(budget_tracker.hard_cap - spend, 4),
        "month": now.strftime("%Y-%m"),
    }
