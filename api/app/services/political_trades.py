"""
Political trades — STUB.

Placeholder pour l'agrégation des trades de membres du Congrès (House Stock
Act + Senate disclosures). Sources gratuites bloquées (S3 403 sur les anciens
mirrors), à implémenter via scraping disclosures-clerk.house.gov +
efdsearch.senate.gov, ou via API payante (Quiver Quantitative ~$30/mois).

Voir memory/project_todo_political_trades.md pour le plan d'attaque.

Pour l'instant retourne toujours un dict vide afin que l'endpoint
/discovery/signals fonctionne sans erreur — les badges "politiques"
s'afficheront silencieusement quand la source sera branchée.
"""
from typing import Optional


def get_political_trades_for_ticker(ticker: str, days: int = 180) -> dict:
    """
    Trades politiques sur un ticker dans les N derniers jours.

    Format prévu (quand implémenté) :
        {
          "ticker": "NVDA",
          "count": 3,
          "buy_count": 2,
          "sell_count": 1,
          "highlights": [
              {"name": "Nancy Pelosi", "transaction": "Buy", "amount_range": "$1M-5M", "date": "..."},
              ...
          ]
        }

    Retour actuel : count=0, highlights=[] (source non encore branchée).
    """
    return {
        "ticker": ticker.upper(),
        "count": 0,
        "buy_count": 0,
        "sell_count": 0,
        "highlights": [],
        "source_available": False,
    }
