"""
Routes : idées soumises par l'utilisateur (User Idea Review Engine)
  POST /ideas                     → soumettre une idée
  GET  /ideas                     → toutes les idées
  GET  /ideas/{id}                → détail + avis système
  POST /ideas/{id}/revise         → réviser l'avis (avec explication du changement)
  GET  /ideas/{id}/history        → historique des révisions
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
import logging

from app.database import get_session
from app.models import UserIdea, IdeaRevision, Company
from app.services import data_service, brief_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ideas", tags=["ideas"])


class IdeaCreate(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=20)
    user_thesis: Optional[str] = Field(None, max_length=5000)


class IdeaRevisionCreate(BaseModel):
    what_changed: str = Field(..., min_length=1, max_length=5000)
    new_facts: Optional[str] = Field(None, max_length=5000)


@router.post("")
async def submit_idea(data: IdeaCreate, session: AsyncSession = Depends(get_session)):
    """
    Soumet une idée.
    Le système génère un avis automatique, datable et révisable.
    """
    ticker = data.ticker.upper()

    # Récupérer ou créer l'entreprise
    result = await session.exec(select(Company).where(Company.ticker == ticker))
    company = result.first()

    if not company:
        info = data_service.get_company_info(ticker)
        company = Company(
            ticker=ticker,
            name=info.get("longName") or info.get("shortName") or ticker,
            exchange=info.get("exchange"),
            sector=info.get("sector"),
            industry=info.get("industry"),
            country=info.get("country"),
            currency=info.get("currency"),
            last_updated=datetime.utcnow(),
        )
        session.add(company)
        await session.flush()

    # Générer l'avis du système
    brief = brief_service.generate_company_brief(ticker)

    # Construire l'avis structuré
    scores = brief.get("scores", {})
    composite = scores.get("composite", 5)

    system_opinion = _format_system_opinion(brief)

    idea = UserIdea(
        company_id=company.id,
        user_thesis=data.user_thesis,
        system_opinion=system_opinion,
        pro_args="\n".join(f"• {a}" for a in brief.get("pro_args", [])),
        con_args="\n".join(f"• {a}" for a in brief.get("con_args", [])),
        validation_conditions=_derive_validation_conditions(brief),
        conviction=brief.get("conviction", "moyen"),
        action=brief.get("action_label", "Surveiller"),
        horizon=brief.get("horizon"),
    )
    session.add(idea)
    try:
        await session.commit()
        await session.refresh(idea)
    except (IntegrityError, Exception) as e:
        await session.rollback()
        logger.error(f"Erreur soumission idée {ticker}: {e}", exc_info=True)
        raise HTTPException(500, "Erreur lors de la soumission de l'idée")

    return {
        "idea": idea,
        "company": {"ticker": company.ticker, "name": company.name},
        "brief": brief,
    }


@router.get("")
async def list_ideas(session: AsyncSession = Depends(get_session)):
    result = await session.exec(
        select(UserIdea, Company)
        .join(Company, UserIdea.company_id == Company.id)
        .order_by(UserIdea.created_at.desc())
    )
    return [
        {
            "id": idea.id,
            "ticker": company.ticker,
            "name": company.name,
            "conviction": idea.conviction,
            "action": idea.action,
            "horizon": idea.horizon,
            "created_at": idea.created_at,
            "updated_at": idea.updated_at,
        }
        for idea, company in result
    ]


@router.get("/{idea_id}")
async def get_idea(idea_id: int, session: AsyncSession = Depends(get_session)):
    """Détail complet d'une idée avec l'avis actuel du système."""
    idea = await session.get(UserIdea, idea_id)
    if not idea:
        raise HTTPException(404, "Idée introuvable")

    company = await session.get(Company, idea.company_id)

    # Données de marché actualisées
    changes = data_service.get_price_changes(company.ticker) if company else {}

    return {
        "idea": idea,
        "company": company,
        "current_price": changes.get("current_price"),
        "change_1d": changes.get("change_1d"),
        "change_1m": changes.get("change_1m"),
    }


@router.post("/{idea_id}/revise")
async def revise_idea(
    idea_id: int,
    data: IdeaRevisionCreate,
    session: AsyncSession = Depends(get_session)
):
    """
    Révise l'avis du système sur une idée.
    Conserve l'avis précédent dans l'historique avec l'explication du changement.
    C'est le cœur de la traçabilité intellectuelle.
    """
    idea = await session.get(UserIdea, idea_id)
    if not idea:
        raise HTTPException(404, "Idée introuvable")

    company = await session.get(Company, idea.company_id)
    if not company:
        raise HTTPException(404, "Entreprise introuvable")

    # Sauvegarder l'avis actuel dans l'historique
    revision = IdeaRevision(
        idea_id=idea_id,
        previous_opinion=idea.system_opinion or "",
        new_opinion="",  # Sera rempli après calcul
        what_changed=data.what_changed,
    )

    # Recalculer l'avis
    brief = brief_service.generate_company_brief(company.ticker)
    new_opinion = _format_system_opinion(brief)

    revision.new_opinion = new_opinion

    # Mettre à jour l'idée
    idea.system_opinion = new_opinion
    idea.pro_args = "\n".join(f"• {a}" for a in brief.get("pro_args", []))
    idea.con_args = "\n".join(f"• {a}" for a in brief.get("con_args", []))
    idea.conviction = brief.get("conviction", "moyen")
    idea.action = brief.get("action_label", "Surveiller")
    idea.updated_at = datetime.utcnow()

    session.add(revision)
    try:
        await session.commit()
        await session.refresh(idea)
    except (IntegrityError, Exception) as e:
        await session.rollback()
        logger.error(f"Erreur révision idée {idea_id}: {e}", exc_info=True)
        raise HTTPException(500, "Erreur lors de la révision de l'idée")

    return {
        "idea": idea,
        "revision": revision,
        "brief": brief,
    }


@router.get("/{idea_id}/history")
async def get_idea_history(idea_id: int, session: AsyncSession = Depends(get_session)):
    """Historique des révisions d'avis — traçabilité complète."""
    idea = await session.get(UserIdea, idea_id)
    if not idea:
        raise HTTPException(404, "Idée introuvable")

    result = await session.exec(
        select(IdeaRevision)
        .where(IdeaRevision.idea_id == idea_id)
        .order_by(IdeaRevision.revised_at.desc())
    )
    revisions = result.all()

    return {
        "idea_id": idea_id,
        "current_opinion": idea.system_opinion,
        "revision_count": len(revisions),
        "revisions": revisions,
    }


# ── Helpers ──────────────────────────────────────────────────────────────────

def _format_system_opinion(brief: dict) -> str:
    """Formate l'avis système en texte structuré."""
    composite = brief.get("scores", {}).get("composite", 5)
    label = brief.get("scores", {}).get("composite_label", "Neutre")
    action = brief.get("action_label", "Surveiller")
    conviction = brief.get("conviction", "moyen")
    horizon = brief.get("horizon", "à définir")

    lines = [
        f"Score composite : {composite}/10 ({label})",
        f"Action suggérée : {action}",
        f"Conviction : {conviction} | Horizon : {horizon}",
        "",
    ]

    pro_args = brief.get("pro_args", [])
    if pro_args:
        lines.append("Points favorables :")
        lines.extend(f"  + {a}" for a in pro_args[:3])

    con_args = brief.get("con_args", [])
    if con_args:
        lines.append("Points défavorables :")
        lines.extend(f"  - {a}" for a in con_args[:3])

    return "\n".join(lines)


def _derive_validation_conditions(brief: dict) -> str:
    """Déduit les conditions de validation depuis les scores."""
    conditions = []
    scores = brief.get("scores", {})

    if scores.get("growth", 0) < 5:
        conditions.append("Confirmation de la reprise de la croissance du CA")
    if scores.get("valuation", 0) < 5:
        conditions.append("Compression du multiple avant d'initier")
    if scores.get("quality", 0) < 5:
        conditions.append("Amélioration des marges opérationnelles")
    if not conditions:
        conditions.append("Confirmer la thèse sur 2 trimestres consécutifs")

    return "\n".join(f"• {c}" for c in conditions)
