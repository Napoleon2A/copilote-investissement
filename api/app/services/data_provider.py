"""
Interface abstraite pour les fournisseurs de données de marché.

Cette interface permet de brancher différents providers (yfinance, IBKR, etc.)
sans changer le code des services consommateurs.

Usage :
    Chaque provider implémente cette Protocol.
    Le data_service.py utilise le provider actif comme façade.
    Pour ajouter IBKR : créer providers/ibkr_provider.py et implémenter DataProvider.
"""
from typing import Protocol, Optional
import pandas as pd


class DataProvider(Protocol):
    """Interface que tout fournisseur de données doit implémenter."""

    def get_company_info(self, ticker: str) -> dict:
        """Métadonnées de l'entreprise (nom, secteur, exchange, etc.)"""
        ...

    def get_current_price(self, ticker: str) -> Optional[float]:
        """Prix actuel (peut être retardé selon le provider)."""
        ...

    def get_price_history(self, ticker: str, period: str = "1y") -> pd.DataFrame:
        """Historique OHLCV. Colonnes : Date, Open, High, Low, Close, Volume."""
        ...

    def get_fundamentals(self, ticker: str) -> dict:
        """Ratios financiers : P/E, EV/EBITDA, marges, ROE, FCF, etc."""
        ...

    def get_price_changes(self, ticker: str) -> dict:
        """Variations de prix multi-horizons : 1d, 1m, 3m, ytd, 52W."""
        ...

    def get_news(self, ticker: str, count: int = 10) -> list[dict]:
        """News récentes : [{title, link, publisher, published}]."""
        ...

    def get_earnings_calendar(self, ticker: str) -> dict:
        """Prochaine date de publication : {earnings_date, revenue_estimate, eps_estimate}."""
        ...

    def search_ticker(self, query: str) -> list[dict]:
        """Recherche de ticker par nom ou symbole."""
        ...
