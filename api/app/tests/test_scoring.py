"""
Tests du moteur de scoring.

Ces tests vérifient que :
  - Les scores restent dans la plage [0, 10]
  - Les heuristiques sont cohérentes (bonne marge → bon score)
  - Les données manquantes ne font pas planter le système
"""
import pytest
from app.services.scoring import (
    score_quality,
    score_valuation,
    score_growth,
    score_momentum,
    score_risk,
    compute_all_scores,
    get_score_label,
)


def test_score_always_in_range():
    """Un score ne doit jamais sortir de [0, 10]."""
    # Cas nominal
    fundamentals = {
        "operating_margin": 0.25,
        "roe": 0.20,
        "net_margin": 0.15,
        "debt_to_equity": 50,
        "pe_ratio": 20,
        "ev_to_ebitda": 12,
        "revenue_growth": 0.15,
        "earnings_growth": 0.20,
    }
    changes = {"change_1m": 5.0, "change_3m": 12.0, "pct_from_52w_high": -10.0, "pct_from_52w_low": 25.0}
    scores = compute_all_scores(fundamentals, changes)

    for key in ["quality", "valuation", "growth", "momentum", "risk"]:
        assert 0 <= scores[key]["score"] <= 10, f"Score {key} hors limites"
    assert 0 <= scores["composite"] <= 10


def test_score_empty_data_does_not_crash():
    """Des données vides ne doivent pas lever d'exception."""
    scores = compute_all_scores({}, {})
    assert isinstance(scores["composite"], float)


def test_high_margin_gives_good_quality():
    """Marge opérationnelle élevée → score qualité supérieur à la moyenne."""
    good = score_quality({"operating_margin": 0.35, "roe": 0.30, "net_margin": 0.25})
    neutral = score_quality({"operating_margin": 0.05})
    assert good["score"] > neutral["score"]


def test_low_pe_gives_good_valuation():
    """P/E bas → score valorisation plus élevé que P/E très haut."""
    cheap = score_valuation({"pe_ratio": 10})
    expensive = score_valuation({"pe_ratio": 60})
    assert cheap["score"] > expensive["score"]


def test_positive_revenue_growth():
    """Croissance CA positive → meilleur score que décroissance."""
    growing = score_growth({"revenue_growth": 0.25, "earnings_growth": 0.20})
    declining = score_growth({"revenue_growth": -0.10, "earnings_growth": -0.15})
    assert growing["score"] > declining["score"]


def test_low_debt_reduces_risk_score_upward():
    """Faible dette → score risque élevé (risque faible)."""
    safe = score_risk({"debt_to_equity": 20, "current_ratio": 2.5}, {})
    risky = score_risk({"debt_to_equity": 300, "current_ratio": 0.8}, {})
    assert safe["score"] > risky["score"]


def test_score_reasons_always_provided():
    """Chaque score doit toujours avoir au moins une raison."""
    scores = compute_all_scores({}, {})
    for key in ["quality", "valuation", "growth", "momentum", "risk"]:
        assert len(scores[key]["reasons"]) >= 1


def test_score_labels():
    assert get_score_label(9.0) == "Excellent"
    assert get_score_label(7.0) == "Bon"
    assert get_score_label(5.0) == "Neutre"
    assert get_score_label(3.0) == "Faible"
    assert get_score_label(1.0) == "Très faible"
