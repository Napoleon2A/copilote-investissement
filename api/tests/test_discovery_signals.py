"""
Tests des helpers de validation multi-angles (discovery_router).

Les services externes (sec_edgar, finnhub_ticker) sont mockés pour rendre les
tests déterministes et hors-ligne. On teste la logique métier, pas les sources.
"""
from datetime import date, timedelta
from unittest.mock import patch

import pytest

from app.routers import discovery_router as dr


# ─── _is_foreign_listing ─────────────────────────────────────────────────────

@pytest.mark.parametrize("symbol,expected", [
    ("AAPL", False),
    ("MSFT", False),
    ("BRK-B", False),    # classe US à tiret, reste US
    ("BRK.B", True),     # point → suffix exchange Yahoo (formats étrangers)
    ("CCO.TO", True),    # Toronto
    ("KAP", False),      # KAP (Kazatomprom ADR) sans point — US-listed
    ("005930.KS", True), # Samsung Korea
    ("VOD.L", True),     # Vodafone London
    ("RDS-A", False),    # ADR US à tiret
    ("NU", False),       # 2 lettres OK
])
def test_is_foreign_listing(symbol, expected):
    assert dr._is_foreign_listing(symbol) is expected


# ─── _build_etf_signal ───────────────────────────────────────────────────────

def test_etf_signal_present():
    etf_index = {"VRT": {"etf_count": 3, "etfs": ["AIQ", "CHAT", "BOTZ"], "avg_weight": 0.04}}
    out = dr._build_etf_signal("VRT", etf_index)
    assert out["present"] is True
    assert out["etf_count"] == 3


def test_etf_signal_absent():
    out = dr._build_etf_signal("ZZZ", {})
    assert out == {"present": False, "etf_count": 0, "etfs": []}


# ─── _build_insider_signal ───────────────────────────────────────────────────

def _fake_tx(date_str: str, change: int, price: float, code: str = "P") -> dict:
    return {"transactionDate": date_str, "change": change, "transactionPrice": price, "transactionCode": code}


def test_insider_excludes_non_discretionary_codes():
    """A (award/grant), M (option exercise), F (tax) ne doivent PAS compter."""
    today = date.today().isoformat()
    transactions = [
        _fake_tx(today, 1000, 50.0, code="A"),  # ignoré (award)
        _fake_tx(today, 500, 50.0, code="M"),   # ignoré (option exercise)
        _fake_tx(today, -200, 50.0, code="F"),  # ignoré (tax)
        _fake_tx(today, 100, 50.0, code="P"),   # compté : 5000$
    ]
    with patch.object(dr.finnhub_ticker, "get_insider_transactions", return_value=transactions), \
         patch.object(dr.finnhub_ticker, "insider_summary", return_value={"count": 4}), \
         patch.object(dr.finnhub_ticker, "get_profile", return_value=None):
        sig = dr._build_insider_signal("AAPL")
    assert sig["buy_count"] == 1
    assert sig["sell_count"] == 0
    assert sig["buy_value_usd"] == 5000


def test_insider_significance_uses_market_cap_bps():
    """Significativité doit dépendre du market cap, pas d'un seuil absolu."""
    today = date.today().isoformat()
    summary = {"count": 1}
    # Smallcap 200M$, achat 200k$ → 10 bps → significatif (≥ 5 bps)
    big_tx = [_fake_tx(today, 2000, 100.0, code="P")]  # 200k$
    with patch.object(dr.finnhub_ticker, "get_insider_transactions", return_value=big_tx), \
         patch.object(dr.finnhub_ticker, "insider_summary", return_value=summary), \
         patch.object(dr.finnhub_ticker, "get_profile", return_value={"marketCapitalization": 200}):
        sig_small = dr._build_insider_signal("XXX")
    assert sig_small["is_significant"] is True
    assert sig_small["net_pct_market_cap_bps"] >= dr.INSIDER_SIGNIFICANCE_BPS

    # Mégacap 1000B$, achat 200k$ → ~0.002 bps → non significatif
    with patch.object(dr.finnhub_ticker, "get_insider_transactions", return_value=big_tx), \
         patch.object(dr.finnhub_ticker, "insider_summary", return_value=summary), \
         patch.object(dr.finnhub_ticker, "get_profile", return_value={"marketCapitalization": 1_000_000}):
        sig_mega = dr._build_insider_signal("AAPL")
    assert sig_mega["is_significant"] is False

    # Smallcap 200M$, achat 50k$ → 2.5 bps → SOUS le seuil 5 bps
    small_tx = [_fake_tx(today, 1000, 50.0, code="P")]
    with patch.object(dr.finnhub_ticker, "get_insider_transactions", return_value=small_tx), \
         patch.object(dr.finnhub_ticker, "insider_summary", return_value=summary), \
         patch.object(dr.finnhub_ticker, "get_profile", return_value={"marketCapitalization": 200}):
        sig_borderline = dr._build_insider_signal("YYY")
    assert sig_borderline["is_significant"] is False


def test_insider_recency_weight_decays():
    """Achat récent doit peser plus qu'un achat ancien dans net_value_weighted."""
    today = date.today()
    recent = today.isoformat()
    old = (today - timedelta(days=60)).isoformat()  # 2 demi-vies
    transactions = [
        _fake_tx(recent, 1000, 100.0, code="P"),  # 100k$ × poids ~1.0
        _fake_tx(old, 1000, 100.0, code="P"),     # 100k$ × poids ~0.25
    ]
    with patch.object(dr.finnhub_ticker, "get_insider_transactions", return_value=transactions), \
         patch.object(dr.finnhub_ticker, "insider_summary", return_value={"count": 2}), \
         patch.object(dr.finnhub_ticker, "get_profile", return_value=None):
        sig = dr._build_insider_signal("XXX")
    # Net brut : 200k. Pondéré : ~125k (1.0 + 0.25) × 100k
    assert sig["net_value_usd"] == 200_000
    assert sig["net_value_weighted_usd"] < sig["net_value_usd"]
    assert sig["net_value_weighted_usd"] > 100_000  # mais pas que la transaction old


def test_insider_foreign_listing_short_circuits():
    sig = dr._build_insider_signal("CCO.TO")
    assert sig["present"] is False
    assert sig["is_significant"] is False


# ─── _build_smart_money_signal ───────────────────────────────────────────────

def test_smart_money_filters_diversified_funds():
    """Les holders dont is_concentrated_fund retourne False sont exclus."""
    holders = [
        {"fund_cik": "0001", "fund_name": "Concentrated", "value_usd": 5e7, "shares": 100,
         "position_pct": 8.0, "status": "initiated", "delta_pct": None,
         "report_date": "2025-12-31", "filing_date": "2026-02-14"},
        {"fund_cik": "0002", "fund_name": "Diversified", "value_usd": 1e7, "shares": 50,
         "position_pct": 0.1, "status": "increased", "delta_pct": 5.0,
         "report_date": "2025-12-31", "filing_date": "2026-02-14"},
    ]
    def fake_concentrated(cik, threshold):
        return cik == "0001"
    with patch.object(dr.sec_edgar, "get_whales_for_ticker", return_value={"holders": holders}), \
         patch.object(dr.sec_edgar, "is_concentrated_fund", side_effect=fake_concentrated):
        sig = dr._build_smart_money_signal("VRT")
    assert sig["concentrated_holders"] == 1
    assert sig["initiated"] == 1
    assert sig["highlights"][0]["fund_name"] == "Concentrated"


def test_smart_money_freshness_computed():
    holders = [
        {"fund_cik": "0001", "fund_name": "F", "value_usd": 1e7, "shares": 100,
         "position_pct": 5.0, "status": "initiated", "delta_pct": None,
         "report_date": "2025-12-31", "filing_date": "2026-02-14"},
    ]
    with patch.object(dr.sec_edgar, "get_whales_for_ticker", return_value={"holders": holders}), \
         patch.object(dr.sec_edgar, "is_concentrated_fund", return_value=True):
        sig = dr._build_smart_money_signal("VRT")
    assert sig["latest_filing_date"] == "2026-02-14"
    assert sig["latest_report_date"] == "2025-12-31"
    assert isinstance(sig["freshness_days"], int)


def test_smart_money_foreign_listing_short_circuits():
    sig = dr._build_smart_money_signal("005930.KS")
    assert sig["present"] is False
    assert sig["concentrated_holders"] == 0
