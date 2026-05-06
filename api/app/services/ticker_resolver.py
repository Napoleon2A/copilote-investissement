"""
Ticker resolver — normalisation nom commun → ticker Yahoo Finance.

Permet de saisir "LVMH", "Tesla" ou "Alphabet" et d'obtenir le ticker correct
(MC.PA, TSLA, GOOGL). Utilisé par get_or_create_company et le chatbot pour
empêcher les entrées invalides en DB.
"""
from typing import Optional

# Correspondance noms communs → tickers Yahoo Finance
COMPANY_NAME_TO_TICKER: dict[str, Optional[str]] = {
    # France / Europe
    "LVMH": "MC.PA",
    "TOTAL": "TTE.PA",
    "TOTALENERGIES": "TTE.PA",
    "AIRBUS": "AIR.PA",
    "AIRFRANCE": "AF.PA",
    "BNP": "BNP.PA",
    "BNPPARIBAS": "BNP.PA",
    "SOCIETE GENERALE": "GLE.PA",
    "SOCIETEGENERALE": "GLE.PA",
    "SOGENE": "GLE.PA",
    "SANOFI": "SAN.PA",
    "LOREAL": "OR.PA",
    "HERMES": "RMS.PA",
    "KERING": "KER.PA",
    "PERNOD": "RI.PA",
    "PERNODRICARD": "RI.PA",
    "MICHELIN": "ML.PA",
    "RENAULT": "RNO.PA",
    "STELLANTIS": "STLA",
    "DASSAULT": "AM.PA",
    "SCHNEIDER": "SU.PA",
    "SAFRAN": "SAF.PA",
    "VINCI": "DG.PA",
    "SAINT GOBAIN": "SGO.PA",
    "SAINTGOBAIN": "SGO.PA",
    "CAPGEMINI": "CAP.PA",
    "LEGRAND": "LR.PA",
    "PUBLICIS": "PUB.PA",
    "CARREFOUR": "CA.PA",
    "DANONE": "BN.PA",
    "CREDIT AGRICOLE": "ACA.PA",
    "CREDITAGRICOLE": "ACA.PA",
    "AXA": "CS.PA",
    "BOUYGUES": "EN.PA",
    "EURONEXT": "ENX.PA",
    "WORLDLINE": "WLN.PA",
    "NOVONORDISK": "NVO",
    "NOVO": "NVO",
    "ASML": "ASML",
    "SAP": "SAP",
    "SIEMENS": "SIE.DE",
    "VOLKSWAGEN": "VOW.DE",
    "BMW": "BMW.DE",
    "MERCEDES": "MBG.DE",
    "ALLIANZ": "ALV.DE",
    "DEUTSCHE BANK": "DBK.DE",
    "NESTLE": "NESN.SW",
    "ROCHE": "ROG.SW",
    "NOVARTIS": "NOVN.SW",
    "UNILEVER": "UL",
    "SHELL": "SHEL",
    "BP": "BP",
    "HSBC": "HSBC",
    "RICHEMONT": "CFR.SW",
    # USA — noms courants
    "TESLA": "TSLA",
    "APPLE": "AAPL",
    "MICROSOFT": "MSFT",
    "GOOGLE": "GOOGL",
    "ALPHABET": "GOOGL",
    "AMAZON": "AMZN",
    "META": "META",
    "FACEBOOK": "META",
    "NVIDIA": "NVDA",
    "NETFLIX": "NFLX",
    "PALANTIR": "PLTR",
    "COINBASE": "COIN",
    "OPENAI": None,  # Pas coté
    "JPMORGAN": "JPM",
    "GOLDMANSACHS": "GS",
    "GOLDMAN": "GS",
    "BERKSHIRE": "BRK-B",
    "JOHNSON": "JNJ",
    "PFIZER": "PFE",
    "EXXON": "XOM",
    "CHEVRON": "CVX",
    "WALMART": "WMT",
    "VISA": "V",
    "MASTERCARD": "MA",
    "PAYPAL": "PYPL",
    "UBER": "UBER",
    "AIRBNB": "ABNB",
    "SPOTIFY": "SPOT",
    "DISNEY": "DIS",
    "SALESFORCE": "CRM",
    "ADOBE": "ADBE",
    "AMD": "AMD",
    "INTEL": "INTC",
    "QUALCOMM": "QCOM",
    "TSMC": "TSM",
    "SAMSUNG": "005930.KS",
    "LILLY": "LLY",
    "ELIYLILLY": "LLY",
    "NOVO NORDISK": "NVO",
    "MERCK": "MRK",
    "ABBVIE": "ABBV",
    "NEWMONT": "NEM",
    "FIRST SOLAR": "FSLR",
    "FIRSTSOLAR": "FSLR",
}


def normalize_ticker(text: str) -> Optional[str]:
    """
    Convertit une saisie utilisateur en ticker Yahoo Finance valide.

    Si l'entrée est déjà un ticker (AAPL, MC.PA), elle est retournée telle quelle
    (en majuscules). Si c'est un nom commun connu (Tesla, Alphabet), on retourne
    le ticker mappé. Retourne None si l'entrée correspond à une société non cotée.

    Exemples :
        "ALPHABET" → "GOOGL"
        "tesla"    → "TSLA"
        "AAPL"     → "AAPL"
        "OPENAI"   → None (pas coté)
    """
    if not text:
        return None
    cleaned = text.upper().strip()
    # Variante sans espaces/tirets pour matcher les clés compactes du dict
    compact = cleaned.replace(" ", "").replace("-", "").replace("_", "")
    if cleaned in COMPANY_NAME_TO_TICKER:
        return COMPANY_NAME_TO_TICKER[cleaned]
    if compact in COMPANY_NAME_TO_TICKER:
        return COMPANY_NAME_TO_TICKER[compact]
    return cleaned
