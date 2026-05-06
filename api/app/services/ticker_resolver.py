"""
Ticker resolver — normalisation nom commun → ticker Yahoo Finance.

Permet de saisir "LVMH", "Tesla", "Alphabet" mais aussi des noms inconnus
("Iris Energy", "Applied Digital") et d'obtenir le ticker correct via :
  1. Dict statique des alias les plus courants (rapide, déterministe)
  2. Fallback dynamique yfinance.Lookup (couvre les small caps obscures)

Utilisé par get_or_create_company et le chatbot pour empêcher les entrées
invalides en DB.
"""
import logging
import re
import threading
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)

# Exchanges Yahoo prioritaires pour le lookup dynamique (par fiabilité de
# liquidité). On évite Stuttgart/Frankfurt/Munich/Dusseldorf qui sont
# souvent des reflets d'actions US et polluent les résultats.
_PRIMARY_EXCHANGES = {
    "NMS",  # NASDAQ
    "NYQ",  # NYSE
    "NGM",  # NASDAQ Global Market
    "NCM",  # NASDAQ Capital Market
    "ASE",  # AMEX
    "PAR",  # Euronext Paris (.PA)
    "AMS",  # Euronext Amsterdam (.AS)
    "BRU",  # Euronext Brussels
    "LSE",  # London (.L)
    "LSC",  # London (cas spéciaux)
    "GER",  # Xetra (.DE)
    "MIL",  # Milan
    "EBS",  # Swiss (.SW)
    "CPH",  # Copenhagen (.CO)
    "STO",  # Stockholm (.ST)
    "HEL",  # Helsinki
}

# Pattern d'un ticker probable (ex: "AAPL", "MC.PA", "BRK-B", "005930.KS")
# Si l'entrée matche, on évite d'appeler le lookup (économie réseau).
_TICKER_REGEX = re.compile(r"^[A-Z0-9]{1,6}([.\-][A-Z0-9]{1,4})?$")

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

    # ─── AI value chain — small/mid caps & noms ambigus (curated) ───
    # Hardware / GPU / accélérateurs
    "BROADCOM": "AVGO",
    "MARVELL": "MRVL",
    "MICRON": "MU",
    "ARM": "ARM",
    "ARM HOLDINGS": "ARM",
    "ASTERA LABS": "ALAB",
    "ASTERALABS": "ALAB",
    "SMCI": "SMCI",
    "SUPER MICRO": "SMCI",
    "SUPERMICRO": "SMCI",
    "DELL": "DELL",
    "HPE": "HPE",
    "HP ENTERPRISE": "HPE",
    "ARISTA": "ANET",
    "ARISTA NETWORKS": "ANET",
    # Foundry / semi capex
    "TSMC": "TSM",
    "APPLIED MATERIALS": "AMAT",
    "LAM RESEARCH": "LRCX",
    "KLA": "KLAC",
    "TERADYNE": "TER",
    "ENTEGRIS": "ENTG",
    "ICHOR": "ICHR",
    "BE SEMI": "BESI.AS",
    "BESEMI": "BESI.AS",
    "ASM INTERNATIONAL": "ASM.AS",
    "ASMI": "ASM.AS",
    "SOITEC": "SOI.PA",
    # AI software / pure play
    "C3.AI": "AI",
    "C3AI": "AI",
    "SNOWFLAKE": "SNOW",
    "DATADOG": "DDOG",
    "MONGODB": "MDB",
    "SERVICENOW": "NOW",
    "CONFLUENT": "CFLT",
    "ELASTIC": "ESTC",
    "CLOUDFLARE": "NET",
    "ESTUN": None,  # exemple non coté US
    # Datacenter / compute / hosting
    "VERTIV": "VRT",
    "IRIS ENERGY": "IREN",
    "IRISENERGY": "IREN",
    "IREN": "IREN",
    "COREWEAVE": "CRWV",
    "NEBIUS": "NBIS",
    "APPLIED DIGITAL": "APLD",
    "APPLIEDDIGITAL": "APLD",
    "DIGITAL REALTY": "DLR",
    "EQUINIX": "EQIX",
    "IRON MOUNTAIN": "IRM",
    "GDS": "GDS",
    # Énergie pour IA — nucléaire / SMR / centrales
    "VISTRA": "VST",
    "CONSTELLATION": "CEG",
    "CONSTELLATION ENERGY": "CEG",
    "TALEN": "TLN",
    "TALEN ENERGY": "TLN",
    "OKLO": "OKLO",
    "NUSCALE": "SMR",
    "NUSCALE POWER": "SMR",
    "BWX": "BWXT",
    "BWXT": "BWXT",
    "CENTRUS": "LEU",
    "CENTRUS ENERGY": "LEU",
    "GE VERNOVA": "GEV",
    "GEVERNOVA": "GEV",
    "QUANTA": "PWR",
    "QUANTA SERVICES": "PWR",
    "EATON": "ETN",
    "MYRGROUP": "MYRG",
    "MYR GROUP": "MYRG",
    "PRIMORIS": "PRIM",
    # Uranium pour énergie nucléaire IA
    "CAMECO": "CCJ",
    "DENISON": "DNN",
    "DENISON MINES": "DNN",
    "URANIUM ENERGY": "UEC",
    "UEC": "UEC",
    # Battery / grid storage
    "EOS": "EOSE",
    "EOS ENERGY": "EOSE",
    "EOSE": "EOSE",
    "FLUENCE": "FLNC",
    "FLUENCE ENERGY": "FLNC",
    "STEM": "STEM",
    # Optique / photonique / réseau pour IA
    "CIENA": "CIEN",
    "LUMENTUM": "LITE",
    "COHERENT": "COHR",
    "APPLIED OPTOELECTRONICS": "AAOI",
    "AAOI": "AAOI",
    "IPG PHOTONICS": "IPGP",
    "IPGP": "IPGP",
    # Cooling / HVAC pour datacenters
    "TRANE": "TT",
    "TRANE TECHNOLOGIES": "TT",
    "WATTS WATER": "WTS",
    # Robotique / automation
    "SYMBOTIC": "SYM",
    "ROCKWELL": "ROK",
    "ROCKWELL AUTOMATION": "ROK",
    "ABB": "ABBNY",  # ADR US
    "INTUITIVE": "ISRG",
    "INTUITIVE SURGICAL": "ISRG",
    "KRATOS": "KTOS",
    # Cybersecurity AI
    "CROWDSTRIKE": "CRWD",
    "PALO ALTO": "PANW",
    "PALOALTO": "PANW",
    "SENTINELONE": "S",
    "SENTINEL ONE": "S",
    "ZSCALER": "ZS",
    # Europe/France small-mid AI value chain
    "STIF": "ALSTI.PA",
    "ALSTI": "ALSTI.PA",
    "STERLING INFRASTRUCTURE": "STRL",
    "STERLINGINFRASTRUCTURE": "STRL",
    # Mégacaps cloud (rappel — déjà dans plusieurs alias)
    "ORACLE": "ORCL",
}


# Cache lookup yfinance : { query.upper() : (ticker_or_None, ts) }
_lookup_cache: dict[str, tuple[Optional[str], datetime]] = {}
_lookup_lock = threading.Lock()
_LOOKUP_TTL = timedelta(days=7)


def _yfinance_lookup(query: str) -> Optional[str]:
    """
    Cherche un ticker via yfinance.Lookup. Privilégie les exchanges principaux
    (NASDAQ, NYSE, Euronext...) pour éviter les reflets allemands/suisses des
    actions US. Retourne None si rien de fiable trouvé.

    Mis en cache 7 jours pour éviter de spammer Yahoo.
    """
    key = query.upper()
    with _lookup_lock:
        cached = _lookup_cache.get(key)
        if cached and (datetime.utcnow() - cached[1]) < _LOOKUP_TTL:
            return cached[0]

    result: Optional[str] = None
    try:
        import yfinance as yf  # import paresseux
        df = yf.Lookup(query).get_stock(count=25)
        if df is not None and not df.empty:
            equities = df[df["quoteType"] == "equity"] if "quoteType" in df.columns else df
            primary = equities[equities["exchange"].isin(_PRIMARY_EXCHANGES)] if "exchange" in equities.columns else equities
            # On ne retourne un résultat QUE si on a un match sur exchange
            # principal. Sinon on préfère None plutôt que d'imposer un reflet
            # allemand sans liquidité (.SG, .MU, .DU, .F...). Force l'utilisateur
            # à saisir le ticker direct ou enrichit le dict statique.
            if not primary.empty:
                result = primary.index[0]
    except Exception as e:
        logger.debug(f"yfinance Lookup '{query}' failed: {e}")
        result = None

    with _lookup_lock:
        _lookup_cache[key] = (result, datetime.utcnow())
    if result:
        logger.info(f"Ticker resolver: '{query}' -> '{result}' (via yfinance.Lookup)")
    return result


def normalize_ticker(text: str, allow_lookup: bool = True) -> Optional[str]:
    """
    Convertit une saisie utilisateur en ticker Yahoo Finance valide.

    Pipeline :
      1. Si vide -> None
      2. Si dans le dict statique -> ticker mappé (peut être None pour société non cotée)
      3. Si déjà au format ticker (AAPL, MC.PA) -> retourne tel quel sans réseau
      4. Sinon, lookup dynamique via yfinance (sauf si allow_lookup=False)
      5. Fallback : majuscules de l'entrée (let it fail at yfinance level)

    Exemples :
        "ALPHABET"      -> "GOOGL"      (dict)
        "tesla"         -> "TSLA"       (dict)
        "AAPL"          -> "AAPL"       (déjà ticker)
        "Iris Energy"   -> "IREN"       (lookup)
        "Applied Digital" -> "APLD"     (lookup)
        "OPENAI"        -> None         (pas coté, dict explicite)
    """
    if not text:
        return None
    raw = text.strip()
    cleaned = raw.upper()
    compact = cleaned.replace(" ", "").replace("-", "").replace("_", "")
    # 1. Dict statique — priorité absolue (déterministe et corrige les ambigus)
    if cleaned in COMPANY_NAME_TO_TICKER:
        return COMPANY_NAME_TO_TICKER[cleaned]
    if compact in COMPANY_NAME_TO_TICKER:
        return COMPANY_NAME_TO_TICKER[compact]
    # 2. Heuristique "déjà un ticker" — strict pour éviter de confondre un
    # nom court ("Vertiv", "Stif") avec un ticker. Critères :
    #   - contient un point ou tiret (MC.PA, BRK-B, 005930.KS), OU
    #   - l'entrée originale est ALL CAPS et fait <= 5 caractères (ex: "AAPL", "VRT")
    looks_like_ticker = (
        ("." in cleaned or "-" in cleaned)
        or (raw.isupper() and len(cleaned) <= 5 and _TICKER_REGEX.match(cleaned))
    )
    if looks_like_ticker:
        return cleaned
    # 3. Lookup dynamique pour les noms non connus
    if allow_lookup:
        resolved = _yfinance_lookup(raw)
        if resolved:
            return resolved
    # 4. Fallback : laisser yfinance se débrouiller (échouera proprement plus tard)
    return cleaned
