"""
Modèle de données — V2

Entités : Company, Watchlist, WatchlistItem, Portfolio, Position, Transaction,
          InvestmentThesis, UserIdea, IdeaRevision, PriceSnapshot, Alert,
          SeenOpportunity, AnalysisLog, Prediction
"""
from datetime import datetime, date
from typing import Optional
from sqlmodel import SQLModel, Field, Relationship


# ─── Entreprise ───────────────────────────────────────────────────────────────

class Company(SQLModel, table=True):
    """Représente une entreprise cotée en bourse."""
    id: Optional[int] = Field(default=None, primary_key=True)
    ticker: str = Field(index=True, unique=True)       # ex: "AAPL"
    name: str                                           # ex: "Apple Inc."
    exchange: Optional[str] = None                     # "NASDAQ", "NYSE", "EPA"
    sector: Optional[str] = None
    industry: Optional[str] = None
    country: Optional[str] = None
    currency: Optional[str] = None
    market_cap: Optional[float] = None
    website: Optional[str] = None
    description: Optional[str] = None
    last_updated: Optional[datetime] = None

    watchlist_items: list["WatchlistItem"] = Relationship(back_populates="company")
    positions: list["Position"] = Relationship(back_populates="company")
    user_ideas: list["UserIdea"] = Relationship(back_populates="company")
    price_snapshots: list["PriceSnapshot"] = Relationship(back_populates="company")
    alerts: list["Alert"] = Relationship(back_populates="company")
    analysis_logs: list["AnalysisLog"] = Relationship(
        back_populates="company",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


# ─── Watchlist ────────────────────────────────────────────────────────────────

class Watchlist(SQLModel, table=True):
    """Liste de suivi nommée (ex: 'Tech US', 'Lignes détenues')."""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    items: list["WatchlistItem"] = Relationship(
        back_populates="watchlist",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class WatchlistItem(SQLModel, table=True):
    """Lien entre une watchlist et une entreprise."""
    id: Optional[int] = Field(default=None, primary_key=True)
    watchlist_id: int = Field(foreign_key="watchlist.id", index=True)
    company_id: int = Field(foreign_key="company.id", index=True)
    note: Optional[str] = None
    added_at: datetime = Field(default_factory=datetime.utcnow)

    watchlist: Optional[Watchlist] = Relationship(back_populates="items")
    company: Optional[Company] = Relationship(back_populates="watchlist_items")


# ─── Portefeuille ─────────────────────────────────────────────────────────────

class Portfolio(SQLModel, table=True):
    """Portefeuille réel ou fictif."""
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(default="Mon portefeuille")
    currency: str = Field(default="EUR")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    positions: list["Position"] = Relationship(back_populates="portfolio")
    transactions: list["Transaction"] = Relationship(back_populates="portfolio")


class Position(SQLModel, table=True):
    """Position ouverte dans un portefeuille."""
    id: Optional[int] = Field(default=None, primary_key=True)
    portfolio_id: int = Field(foreign_key="portfolio.id", index=True)
    company_id: int = Field(foreign_key="company.id", index=True)
    quantity: float = Field(ge=0)  # >= 0 car les ventes réduisent la quantité
    avg_cost: float          # Prix moyen d'achat
    currency: str = "EUR"
    opened_at: datetime = Field(default_factory=datetime.utcnow)

    portfolio: Optional[Portfolio] = Relationship(back_populates="positions")
    company: Optional[Company] = Relationship(back_populates="positions")
    thesis: Optional["InvestmentThesis"] = Relationship(back_populates="position")


class Transaction(SQLModel, table=True):
    """Historique des achats et ventes."""
    id: Optional[int] = Field(default=None, primary_key=True)
    portfolio_id: int = Field(foreign_key="portfolio.id", index=True)
    company_id: int = Field(foreign_key="company.id", index=True)
    type: str                # "buy" | "sell"
    quantity: float = Field(gt=0)  # > 0 obligatoire pour toute transaction
    price: float
    fees: float = 0.0
    date: datetime = Field(default_factory=datetime.utcnow)
    note: Optional[str] = None

    portfolio: Optional[Portfolio] = Relationship(back_populates="transactions")


# ─── Thèse d'investissement ───────────────────────────────────────────────────

class InvestmentThesis(SQLModel, table=True):
    """Thèse liée à une position — écrite avant ou après achat."""
    id: Optional[int] = Field(default=None, primary_key=True)
    position_id: int = Field(foreign_key="position.id", unique=True, index=True)
    thesis: str
    catalysts: Optional[str] = None
    risks: Optional[str] = None
    horizon: Optional[str] = None    # "court" | "moyen" | "long"
    conviction: int = 3              # 1 à 5
    invalidation_conditions: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    position: Optional[Position] = Relationship(back_populates="thesis")


# ─── Idées soumises par l'utilisateur ────────────────────────────────────────

class UserIdea(SQLModel, table=True):
    """
    Idée soumise par l'utilisateur.
    Le système produit un avis, le date, le révise si les faits changent.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    company_id: int = Field(foreign_key="company.id", index=True)
    user_thesis: Optional[str] = None       # Ce que l'utilisateur pense
    system_opinion: Optional[str] = None    # Avis généré par le système
    pro_args: Optional[str] = None
    con_args: Optional[str] = None
    validation_conditions: Optional[str] = None
    conviction: Optional[str] = None        # "faible" | "moyen" | "élevé"
    action: Optional[str] = None            # "surveiller" | "initier" | "éviter" etc.
    horizon: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    company: Optional[Company] = Relationship(back_populates="user_ideas")
    revisions: list["IdeaRevision"] = Relationship(back_populates="idea")


class IdeaRevision(SQLModel, table=True):
    """Historique des révisions d'avis — traçabilité intellectuelle."""
    id: Optional[int] = Field(default=None, primary_key=True)
    idea_id: int = Field(foreign_key="useridea.id", index=True)
    previous_opinion: str
    new_opinion: str
    what_changed: str           # Ce qui a changé dans les faits
    revised_at: datetime = Field(default_factory=datetime.utcnow)

    idea: Optional[UserIdea] = Relationship(back_populates="revisions")


# ─── Snapshot de prix ─────────────────────────────────────────────────────────

class PriceSnapshot(SQLModel, table=True):
    """
    Snapshot journalier de prix.
    Stocke aussi les métriques fondamentales clés pour éviter de recalculer.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    company_id: int = Field(foreign_key="company.id", index=True)
    date: date
    price: float
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    volume: Optional[float] = None
    change_pct: Optional[float] = None      # % variation vs veille
    change_5d: Optional[float] = None
    change_1m: Optional[float] = None
    change_ytd: Optional[float] = None

    # Fondamentaux clés au moment du snapshot
    pe_ratio: Optional[float] = None
    ev_ebitda: Optional[float] = None
    fcf_yield: Optional[float] = None
    market_cap: Optional[float] = None

    fetched_at: datetime = Field(default_factory=datetime.utcnow)

    company: Optional[Company] = Relationship(back_populates="price_snapshots")


# ─── Alertes ──────────────────────────────────────────────────────────────────

class Alert(SQLModel, table=True):
    """Alerte sur un ticker — déclenchée par condition."""
    id: Optional[int] = Field(default=None, primary_key=True)
    company_id: int = Field(foreign_key="company.id", index=True)
    type: str           # "price_above" | "price_below" | "change_pct" | "earnings"
    condition_value: Optional[float] = None
    message: Optional[str] = None
    active: bool = Field(default=True, index=True)
    triggered: bool = Field(default=False, index=True)
    triggered_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    company: Optional[Company] = Relationship(back_populates="alerts")


# ─── Opportunités vues (historique scanner) ──────────────────────────────────

class SeenOpportunity(SQLModel, table=True):
    """
    Trace chaque opportunité détectée par le scanner.
    Permet de distinguer les nouvelles opportunités des récurrentes.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    ticker: str = Field(index=True, unique=True)
    first_seen_at: datetime = Field(default_factory=datetime.utcnow)
    last_seen_at: datetime = Field(default_factory=datetime.utcnow)
    times_seen: int = Field(default=1)
    last_score: Optional[float] = None


# ─── Journal d'analyse (mémoire chatbot + traçabilité) ───────────────────────

class AnalysisLog(SQLModel, table=True):
    """
    Chaque analyse d'une entreprise est loggée ici.
    Permet au chatbot de se souvenir des analyses précédentes,
    et de mesurer l'évolution des scores dans le temps.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    company_id: Optional[int] = Field(default=None, foreign_key="company.id", index=True)
    ticker: str = Field(index=True)
    analysis_type: str          # "chat" | "idea" | "brief" | "scan" | "company_page"
    composite_score: Optional[float] = None
    quality_score: Optional[float] = None
    valuation_score: Optional[float] = None
    growth_score: Optional[float] = None
    momentum_score: Optional[float] = None
    risk_score: Optional[float] = None
    action: Optional[str] = None
    analyzed_at: datetime = Field(default_factory=datetime.utcnow)

    company: Optional[Company] = Relationship(back_populates="analysis_logs")


# ─── Prédictions (conviction tracker) ────────────────────────────────────────

class Prediction(SQLModel, table=True):
    """
    Enregistre chaque prédiction du système pour mesurer sa précision.
    Le prix est capturé au moment de la recommandation, puis résolu
    après 1 semaine, 1 mois et 3 mois.
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    ticker: str = Field(index=True)
    source: str                 # "scan" | "idea" | "brief"
    score_at_prediction: float
    price_at_prediction: float
    predicted_action: str       # "buy_small" | "read" | "watch" etc.
    created_at: datetime = Field(default_factory=datetime.utcnow)
    price_1w: Optional[float] = None
    price_1m: Optional[float] = None
    price_3m: Optional[float] = None
    resolved: bool = Field(default=False, index=True)
