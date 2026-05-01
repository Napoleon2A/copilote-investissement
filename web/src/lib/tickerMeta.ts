/**
 * Métadonnées des tickers — nom de société + domaine pour les logos.
 * Logos servis via Clearbit (gratuit, fallback sur initiales colorées).
 */

export type GeoRegion = "us" | "europe" | "uk" | "emerging" | "japan" | "canada";
export type MegaTrend = "ai" | "green_energy" | "biotech" | "luxury" | "defense" | "ecommerce" | "cloud" | "cyber" | "ev" | "uranium" | "space" | "obesity";

export interface TickerMeta {
  name: string;
  domain?: string;
  sector?: SectorKey;
  geo?: GeoRegion;
  trends?: MegaTrend[];   // Mégatendances exposées (max 2)
}

export type SectorKey =
  | "tech" | "semi" | "cyber" | "cloud" | "finance"
  | "health" | "biotech" | "energy" | "consumer" | "staples"
  | "industrial" | "reits" | "materials" | "growth" | "europe";

export const SECTOR_COLORS: Record<SectorKey, { bg: string; text: string; border: string }> = {
  tech:       { bg: "bg-blue-500/10",    text: "text-blue-700 dark:text-blue-400",       border: "border-blue-500/30" },
  semi:       { bg: "bg-cyan-500/10",    text: "text-cyan-700 dark:text-cyan-400",       border: "border-cyan-500/30" },
  cyber:      { bg: "bg-violet-500/10",  text: "text-violet-700 dark:text-violet-400",   border: "border-violet-500/30" },
  cloud:      { bg: "bg-sky-500/10",     text: "text-sky-700 dark:text-sky-400",         border: "border-sky-500/30" },
  finance:    { bg: "bg-indigo-500/10",  text: "text-indigo-700 dark:text-indigo-400",   border: "border-indigo-500/30" },
  health:     { bg: "bg-rose-500/10",    text: "text-rose-700 dark:text-rose-400",       border: "border-rose-500/30" },
  biotech:    { bg: "bg-pink-500/10",    text: "text-pink-700 dark:text-pink-400",       border: "border-pink-500/30" },
  energy:     { bg: "bg-orange-500/10",  text: "text-orange-700 dark:text-orange-400",   border: "border-orange-500/30" },
  consumer:   { bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-500/30" },
  staples:    { bg: "bg-teal-500/10",    text: "text-teal-700 dark:text-teal-400",       border: "border-teal-500/30" },
  industrial: { bg: "bg-slate-500/10",   text: "text-slate-700 dark:text-slate-400",     border: "border-slate-500/30" },
  reits:      { bg: "bg-amber-500/10",   text: "text-amber-700 dark:text-amber-400",     border: "border-amber-500/30" },
  materials:  { bg: "bg-yellow-500/10",  text: "text-yellow-700 dark:text-yellow-400",   border: "border-yellow-500/30" },
  growth:     { bg: "bg-fuchsia-500/10", text: "text-fuchsia-700 dark:text-fuchsia-400", border: "border-fuchsia-500/30" },
  europe:     { bg: "bg-blue-500/10",    text: "text-blue-700 dark:text-blue-400",       border: "border-blue-500/30" },
};

export const SECTOR_LABEL: Record<SectorKey, string> = {
  tech: "Tech", semi: "Semi", cyber: "Cyber", cloud: "Cloud",
  finance: "Finance", health: "Santé", biotech: "Biotech",
  energy: "Énergie", consumer: "Conso", staples: "Staples",
  industrial: "Industrie", reits: "REITs", materials: "Matières",
  growth: "Growth", europe: "Europe",
};

export const TICKER_META: Record<string, TickerMeta> = {
  // Tech US
  AAPL:  { name: "Apple",        domain: "apple.com",        sector: "tech" },
  MSFT:  { name: "Microsoft",    domain: "microsoft.com",    sector: "tech" },
  GOOGL: { name: "Alphabet",     domain: "abc.xyz",          sector: "tech" },
  GOOG:  { name: "Alphabet",     domain: "abc.xyz",          sector: "tech" },
  ALPHABET: { name: "Alphabet",  domain: "abc.xyz",          sector: "tech" },
  META:  { name: "Meta",         domain: "meta.com",         sector: "tech" },
  AMZN:  { name: "Amazon",       domain: "amazon.com",       sector: "consumer" },
  TSLA:  { name: "Tesla",        domain: "tesla.com",        sector: "consumer" },
  NVDA:  { name: "Nvidia",       domain: "nvidia.com",       sector: "semi" },
  AMD:   { name: "AMD",          domain: "amd.com",          sector: "semi" },
  CRM:   { name: "Salesforce",   domain: "salesforce.com",   sector: "cloud" },
  ADBE:  { name: "Adobe",        domain: "adobe.com",        sector: "tech" },
  NOW:   { name: "ServiceNow",   domain: "servicenow.com",   sector: "cloud" },
  AVGO:  { name: "Broadcom",     domain: "broadcom.com",     sector: "semi" },
  UBER:  { name: "Uber",         domain: "uber.com",         sector: "consumer" },
  ORCL:  { name: "Oracle",       domain: "oracle.com",       sector: "tech" },

  // Semi-conducteurs
  ASML:  { name: "ASML",         domain: "asml.com",         sector: "semi" },
  TSM:   { name: "TSMC",         domain: "tsmc.com",         sector: "semi" },
  AMAT:  { name: "Applied Mat.", domain: "appliedmaterials.com", sector: "semi" },
  LRCX:  { name: "Lam Research", domain: "lamresearch.com",  sector: "semi" },
  KLAC:  { name: "KLA Corp",     domain: "kla.com",          sector: "semi" },
  MU:    { name: "Micron",       domain: "micron.com",       sector: "semi" },
  INTC:  { name: "Intel",        domain: "intel.com",        sector: "semi" },
  STM:   { name: "STMicro",      domain: "st.com",           sector: "semi" },
  MRVL:  { name: "Marvell",      domain: "marvell.com",      sector: "semi" },

  // Cybersécurité
  CRWD:  { name: "CrowdStrike",  domain: "crowdstrike.com",  sector: "cyber" },
  ZS:    { name: "Zscaler",      domain: "zscaler.com",      sector: "cyber" },
  FTNT:  { name: "Fortinet",     domain: "fortinet.com",     sector: "cyber" },
  PANW:  { name: "Palo Alto",    domain: "paloaltonetworks.com", sector: "cyber" },
  S:     { name: "SentinelOne",  domain: "sentinelone.com",  sector: "cyber" },

  // Cloud & SaaS
  SNOW:  { name: "Snowflake",    domain: "snowflake.com",    sector: "cloud" },
  DDOG:  { name: "Datadog",      domain: "datadoghq.com",    sector: "cloud" },
  NET:   { name: "Cloudflare",   domain: "cloudflare.com",   sector: "cloud" },
  MDB:   { name: "MongoDB",      domain: "mongodb.com",      sector: "cloud" },
  TEAM:  { name: "Atlassian",    domain: "atlassian.com",    sector: "cloud" },

  // Finance
  JPM:   { name: "JPMorgan",     domain: "jpmorganchase.com", sector: "finance" },
  GS:    { name: "Goldman",      domain: "goldmansachs.com", sector: "finance" },
  "BRK-B": { name: "Berkshire",  domain: "berkshirehathaway.com", sector: "finance" },
  V:     { name: "Visa",         domain: "visa.com",         sector: "finance" },
  MA:    { name: "Mastercard",   domain: "mastercard.com",   sector: "finance" },
  AXP:   { name: "Amex",         domain: "americanexpress.com", sector: "finance" },
  SPGI:  { name: "S&P Global",   domain: "spglobal.com",     sector: "finance" },

  // Santé
  LLY:   { name: "Eli Lilly",    domain: "lilly.com",        sector: "health" },
  UNH:   { name: "UnitedHealth", domain: "unitedhealthgroup.com", sector: "health" },
  ABBV:  { name: "AbbVie",       domain: "abbvie.com",       sector: "health" },
  MRK:   { name: "Merck",        domain: "merck.com",        sector: "health" },
  ISRG:  { name: "Intuitive",    domain: "intuitive.com",    sector: "health" },
  DXCM:  { name: "Dexcom",       domain: "dexcom.com",       sector: "health" },
  VEEV:  { name: "Veeva",        domain: "veeva.com",        sector: "health" },

  // Biotech
  AMGN:  { name: "Amgen",        domain: "amgen.com",        sector: "biotech" },
  GILD:  { name: "Gilead",       domain: "gilead.com",       sector: "biotech" },
  REGN:  { name: "Regeneron",    domain: "regeneron.com",    sector: "biotech" },
  VRTX:  { name: "Vertex",       domain: "vrtx.com",         sector: "biotech" },
  MRNA:  { name: "Moderna",      domain: "modernatx.com",    sector: "biotech" },

  // Énergie
  XOM:   { name: "ExxonMobil",   domain: "exxonmobil.com",   sector: "energy" },
  CVX:   { name: "Chevron",      domain: "chevron.com",      sector: "energy" },
  COP:   { name: "ConocoPhil.",  domain: "conocophillips.com", sector: "energy" },
  NEE:   { name: "NextEra",      domain: "nexteraenergy.com", sector: "energy" },
  FSLR:  { name: "First Solar",  domain: "firstsolar.com",   sector: "energy" },
  ENPH:  { name: "Enphase",      domain: "enphase.com",      sector: "energy" },
  EOSE:  { name: "Eos Energy",   domain: "eose.com",         sector: "energy" },
  ARRY:  { name: "Array Tech",   domain: "arraytechinc.com", sector: "energy" },

  // Consommation
  NKE:   { name: "Nike",         domain: "nike.com",         sector: "consumer" },
  COST:  { name: "Costco",       domain: "costco.com",       sector: "staples" },
  HD:    { name: "Home Depot",   domain: "homedepot.com",    sector: "consumer" },
  PG:    { name: "P&G",          domain: "pg.com",           sector: "staples" },
  KO:    { name: "Coca-Cola",    domain: "coca-colacompany.com", sector: "staples" },
  PEP:   { name: "PepsiCo",      domain: "pepsico.com",      sector: "staples" },
  WMT:   { name: "Walmart",      domain: "walmart.com",      sector: "staples" },

  // Industriels & Défense
  RTX:   { name: "RTX",          domain: "rtx.com",          sector: "industrial" },
  LMT:   { name: "Lockheed",     domain: "lockheedmartin.com", sector: "industrial" },
  NOC:   { name: "Northrop",     domain: "northropgrumman.com", sector: "industrial" },
  GE:    { name: "GE Aerospace", domain: "geaerospace.com",  sector: "industrial" },
  CAT:   { name: "Caterpillar",  domain: "caterpillar.com",  sector: "industrial" },
  DE:    { name: "Deere",        domain: "deere.com",        sector: "industrial" },
  BA:    { name: "Boeing",       domain: "boeing.com",       sector: "industrial" },
  LHX:   { name: "L3Harris",     domain: "l3harris.com",     sector: "industrial" },

  // REITs
  PLD:   { name: "Prologis",     domain: "prologis.com",     sector: "reits" },
  AMT:   { name: "American Tower", domain: "americantower.com", sector: "reits" },
  EQIX:  { name: "Equinix",      domain: "equinix.com",      sector: "reits" },
  DLR:   { name: "Digital Realty", domain: "digitalrealty.com", sector: "reits" },

  // Europe
  "MC.PA":  { name: "LVMH",      domain: "lvmh.com",         sector: "consumer" },
  "AIR.PA": { name: "Airbus",    domain: "airbus.com",       sector: "industrial" },
  "OR.PA":  { name: "L'Oréal",   domain: "loreal.com",       sector: "consumer" },
  "TTE.PA": { name: "TotalEnergies", domain: "totalenergies.com", sector: "energy" },
  SAP:      { name: "SAP",       domain: "sap.com",          sector: "tech" },
  "NOVO-B.CO": { name: "Novo Nordisk", domain: "novonordisk.com", sector: "health" },
  "BNP.PA": { name: "BNP Paribas", domain: "bnpparibas.com", sector: "finance" },
  "SAN.PA": { name: "Sanofi",    domain: "sanofi.com",       sector: "health" },
  "DG.PA":  { name: "Vinci",     domain: "vinci.com",        sector: "industrial" },
  "KER.PA": { name: "Kering",    domain: "kering.com",       sector: "consumer" },

  // UK
  "SHEL.L": { name: "Shell",     domain: "shell.com",        sector: "energy" },
  "AZN.L":  { name: "AstraZeneca", domain: "astrazeneca.com", sector: "health" },
  "RIO.L":  { name: "Rio Tinto", domain: "riotinto.com",     sector: "materials" },
  "LSEG.L": { name: "LSEG",      domain: "lseg.com",         sector: "finance" },

  // Emerging Markets
  BABA:  { name: "Alibaba",      domain: "alibabagroup.com", sector: "tech" },
  PDD:   { name: "Pinduoduo",    domain: "pddholdings.com",  sector: "consumer" },
  MELI:  { name: "MercadoLibre", domain: "mercadolibre.com", sector: "consumer" },
  NU:    { name: "Nu Holdings",  domain: "nubank.com.br",    sector: "finance" },
  SE:    { name: "Sea Limited",  domain: "sea.com",          sector: "consumer" },

  // Growth / Spéculatif
  RKLB:  { name: "Rocket Lab",   domain: "rocketlabusa.com", sector: "growth" },
  JOBY:  { name: "Joby Aviation", domain: "jobyaviation.com", sector: "growth" },
  PLTR:  { name: "Palantir",     domain: "palantir.com",     sector: "tech" },
  HOOD:  { name: "Robinhood",    domain: "robinhood.com",    sector: "finance" },
  SOFI:  { name: "SoFi",         domain: "sofi.com",         sector: "finance" },
  IONQ:  { name: "IonQ",         domain: "ionq.com",         sector: "growth" },
  RGTI:  { name: "Rigetti",      domain: "rigetti.com",      sector: "growth" },

  // Matières premières
  FCX:   { name: "Freeport",     domain: "fcx.com",          sector: "materials" },
  NEM:   { name: "Newmont",      domain: "newmont.com",      sector: "materials" },
  AA:    { name: "Alcoa",        domain: "alcoa.com",        sector: "materials" },
  VALE:  { name: "Vale",         domain: "vale.com",         sector: "materials" },
};

/* ── Région géographique : dérivée du suffixe + tickers spéciaux ──────── */

function inferGeo(ticker: string): GeoRegion {
  const t = ticker.toUpperCase();
  // Tickers chinois/émergents cotés ADR
  const EMERGING = new Set(["BABA", "PDD", "MELI", "NU", "SE", "VALE", "JD", "TCOM", "BIDU", "NIO"]);
  if (EMERGING.has(t)) return "emerging";

  if (t.endsWith(".L")) return "uk";
  if (t.endsWith(".PA") || t.endsWith(".AS") || t.endsWith(".MC") ||
      t.endsWith(".DE") || t.endsWith(".MI") || t.endsWith(".CO") ||
      t.endsWith(".BR") || t.endsWith(".SW")) return "europe";
  if (t.endsWith(".HK")) return "emerging";
  if (t.endsWith(".T")) return "japan";
  if (t.endsWith(".TO")) return "canada";

  // SAP est allemand mais coté US (sans suffixe)
  if (t === "SAP" || t === "ASML") return "europe";

  return "us"; // default
}

/* ── Mégatendances : exposition principale par ticker ─────────────────── */

const TRENDS_MAP: Record<string, MegaTrend[]> = {
  // AI
  NVDA: ["ai"], AMD: ["ai"], MSFT: ["ai", "cloud"], GOOGL: ["ai", "cloud"], GOOG: ["ai", "cloud"],
  META: ["ai"], PLTR: ["ai"], CRM: ["ai", "cloud"], NOW: ["ai", "cloud"],
  AVGO: ["ai"], TSM: ["ai"], ASML: ["ai"], MU: ["ai"], MRVL: ["ai"], INTC: ["ai"],

  // Cloud
  SNOW: ["cloud", "ai"], DDOG: ["cloud"], NET: ["cloud", "cyber"], MDB: ["cloud"], TEAM: ["cloud"],
  ORCL: ["cloud", "ai"], ADBE: ["cloud", "ai"],
  AMZN: ["cloud", "ecommerce"],

  // Cyber
  CRWD: ["cyber", "ai"], ZS: ["cyber"], FTNT: ["cyber"], PANW: ["cyber"], S: ["cyber"],

  // Green Energy / EV
  FSLR: ["green_energy"], ENPH: ["green_energy"], ARRY: ["green_energy"], EOSE: ["green_energy"],
  NEE: ["green_energy"], TSLA: ["ev", "ai"],

  // Biotech / obesity
  LLY: ["obesity", "biotech"], NVO: ["obesity", "biotech"], "NOVO-B.CO": ["obesity", "biotech"],
  MRNA: ["biotech"], REGN: ["biotech"], VRTX: ["biotech"], AMGN: ["biotech"], GILD: ["biotech"],

  // Luxe
  "MC.PA": ["luxury"], "OR.PA": ["luxury"], "KER.PA": ["luxury"],

  // Défense
  LMT: ["defense"], RTX: ["defense"], NOC: ["defense"], LHX: ["defense"], BA: ["defense"],
  "AIR.PA": ["defense"],

  // E-commerce
  BABA: ["ecommerce"], PDD: ["ecommerce"], MELI: ["ecommerce"], SE: ["ecommerce"],

  // Space
  RKLB: ["space"], JOBY: ["space"],

  // Materials (or, cuivre via pétrole)
  NEM: [], FCX: [], AA: [],

  // Reste : pas de trend dominante explicite
};

export function getTickerMeta(ticker: string): TickerMeta {
  const t = ticker.toUpperCase();
  const base = TICKER_META[t] ?? { name: ticker };
  return {
    ...base,
    geo: base.geo ?? inferGeo(t),
    trends: base.trends ?? TRENDS_MAP[t] ?? [],
  };
}

export const GEO_LABEL: Record<GeoRegion, string> = {
  us: "🇺🇸 US",
  europe: "🇪🇺 Europe",
  uk: "🇬🇧 UK",
  emerging: "🌏 Émergents",
  japan: "🇯🇵 Japon",
  canada: "🇨🇦 Canada",
};

export const TREND_LABEL: Record<MegaTrend, string> = {
  ai: "Intelligence artificielle",
  green_energy: "Énergie verte",
  biotech: "Biotech",
  luxury: "Luxe",
  defense: "Défense",
  ecommerce: "E-commerce",
  cloud: "Cloud / SaaS",
  cyber: "Cybersécurité",
  ev: "Véhicules électriques",
  uranium: "Uranium / nucléaire",
  space: "Aérospatial",
  obesity: "Obésité (GLP-1)",
};

export function getLogoUrl(ticker: string): string | null {
  const meta = getTickerMeta(ticker);
  if (!meta.domain) return null;
  return `https://logo.clearbit.com/${meta.domain}`;
}
