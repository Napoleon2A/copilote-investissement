"""
Risk Manager — gestion du risque et dimensionnement de position.

Fonctions :
  - calculate_position_size : combien d'actions acheter étant donné le risque
  - suggest_stop_loss : niveaux de stop-loss basés sur la volatilité
  - check_sector_concentration : vérifie qu'un nouvel achat ne surexpose pas un secteur
"""
import logging

from app.services.data_service import get_price_changes, get_company_info
from app.services.scanner import SCAN_UNIVERSE

logger = logging.getLogger(__name__)


def calculate_position_size(
    portfolio_value: float,
    risk_pct: float,
    entry_price: float,
    stop_price: float,
) -> dict:
    """
    Calcule la taille de position optimale.

    Méthode : risque fixe par trade.
    - On risque risk_pct% du portefeuille sur ce trade.
    - Le risque par action = entry_price - stop_price.
    - Nombre d'actions = dollar_risk / risk_per_share.

    Args:
        portfolio_value: valeur totale du portefeuille
        risk_pct: % du portefeuille qu'on accepte de perdre (ex: 1.0 = 1%)
        entry_price: prix d'entrée prévu
        stop_price: prix du stop-loss

    Returns:
        dict avec shares, dollar_risk, position_value, pct_of_portfolio
    """
    if entry_price <= 0 or stop_price <= 0:
        return {"error": "Prix invalides"}
    if entry_price <= stop_price:
        return {"error": "Le stop-loss doit être inférieur au prix d'entrée"}

    # Risque max en dollars
    # Le risk_pct est en pourcentage (ex: 1.0 = 1% du portefeuille)
    dollar_risk = portfolio_value * (risk_pct / 100)

    # Risque par action
    risk_per_share = entry_price - stop_price

    # Nombre d'actions (arrondi à l'entier inférieur)
    shares = int(dollar_risk / risk_per_share)

    position_value = shares * entry_price
    pct_of_portfolio = (position_value / portfolio_value * 100) if portfolio_value > 0 else 0

    return {
        "shares": shares,
        "dollar_risk": round(dollar_risk, 2),
        "risk_per_share": round(risk_per_share, 2),
        "position_value": round(position_value, 2),
        "pct_of_portfolio": round(pct_of_portfolio, 2),
        "entry_price": entry_price,
        "stop_price": stop_price,
    }


def suggest_stop_loss(ticker: str, entry_price: float | None = None) -> dict:
    """
    Suggère des niveaux de stop-loss basés sur la volatilité 52 semaines.

    Méthode : utilise l'amplitude 52W comme proxy de volatilité.
    - Stop serré : 1/4 de l'amplitude sous le prix actuel
    - Stop modéré : 1/3 de l'amplitude
    - Stop large : 1/2 de l'amplitude

    Avertissement : ces niveaux sont des heuristiques, pas des seuils optimaux.
    """
    changes = get_price_changes(ticker)
    if not changes:
        return {"error": f"Données indisponibles pour {ticker}"}

    price = entry_price or changes.get("current_price", 0)
    if not price:
        return {"error": "Prix actuel indisponible"}

    # Recalculer les prix 52W à partir des pourcentages retournés par get_price_changes.
    # pct_from_52w_low = ((price - low) / low) * 100  →  low = price / (1 + pct/100)
    # pct_from_52w_high = ((price - high) / high) * 100  →  high = price / (1 + pct/100)
    pct_from_low = changes.get("pct_from_52w_low", 0)
    pct_from_high = changes.get("pct_from_52w_high", 0)

    if pct_from_low and pct_from_high:
        low_52w = price / (1 + pct_from_low / 100)
        high_52w = price / (1 + pct_from_high / 100)
        amplitude_pct = ((high_52w - low_52w) / price) * 100
    else:
        # Fallback : utiliser les changements de prix
        amplitude_pct = abs(changes.get("change_3m", 0) or 15)  # default 15%

    # Trois niveaux de stop
    tight_pct = amplitude_pct * 0.15
    moderate_pct = amplitude_pct * 0.25
    wide_pct = amplitude_pct * 0.40

    return {
        "ticker": ticker,
        "current_price": price,
        "amplitude_52w_pct": round(amplitude_pct, 1),
        "stops": {
            "tight": {
                "price": round(price * (1 - tight_pct / 100), 2),
                "pct_from_entry": round(-tight_pct, 1),
                "label": "Serré — swing trading",
            },
            "moderate": {
                "price": round(price * (1 - moderate_pct / 100), 2),
                "pct_from_entry": round(-moderate_pct, 1),
                "label": "Modéré — position trading",
            },
            "wide": {
                "price": round(price * (1 - wide_pct / 100), 2),
                "pct_from_entry": round(-wide_pct, 1),
                "label": "Large — investissement",
            },
        },
    }


def check_sector_concentration(
    current_positions: list[dict],
    new_ticker: str,
    new_value: float,
    max_sector_pct: float = 25.0,
) -> dict:
    """
    Vérifie si l'ajout d'une position créerait une surexposition sectorielle.

    Args:
        current_positions: [{ticker, value, sector}]
        new_ticker: ticker à ajouter
        new_value: valeur de la nouvelle position
        max_sector_pct: concentration max par secteur (défaut 25%)

    Returns:
        dict avec sector, current_pct, projected_pct, ok, warning
    """
    # Déterminer le secteur du nouveau ticker
    new_sector = None
    for sector, tickers in SCAN_UNIVERSE.items():
        if new_ticker.upper() in tickers:
            new_sector = sector
            break

    if not new_sector:
        info = get_company_info(new_ticker)
        new_sector = info.get("sector", "Inconnu")

    # Calculer la valeur totale actuelle + nouvelle
    total_value = sum(p.get("value", 0) for p in current_positions) + new_value
    if total_value <= 0:
        return {"ok": True, "warning": None}

    # Calculer l'exposition actuelle au secteur
    sector_value = sum(
        p.get("value", 0) for p in current_positions
        if p.get("sector") == new_sector
    ) + new_value

    pct = (sector_value / total_value) * 100

    ok = pct <= max_sector_pct
    warning = None
    if not ok:
        warning = f"Attention : {new_sector} représenterait {pct:.1f}% du portefeuille (max recommandé : {max_sector_pct}%)"

    return {
        "ticker": new_ticker,
        "sector": new_sector,
        "current_sector_pct": round(pct - (new_value / total_value * 100), 1),
        "projected_sector_pct": round(pct, 1),
        "max_allowed_pct": max_sector_pct,
        "ok": ok,
        "warning": warning,
    }
