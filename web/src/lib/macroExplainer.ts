/**
 * Vulgarisation du contexte macro pour non-trader.
 * Convertit les indicateurs techniques (VIX, régime, etc.) en explications claires.
 */

export interface MacroExplanation {
  headline: string;       // 1 phrase claire
  detail: string;         // explication pédagogique
  tone: "positive" | "negative" | "neutral" | "warning";
}

export function explainVix(vix: number | null | undefined): MacroExplanation | null {
  if (vix == null) return null;

  if (vix < 13) {
    return {
      headline: `Marchés très calmes (VIX ${vix.toFixed(1)})`,
      detail: "Le VIX mesure la peur des investisseurs. À ce niveau, ils sont presque trop sereins — historiquement, les périodes de complaisance précèdent souvent des retournements brusques. Bonne fenêtre pour entrer en position, mais ne pas s'endetter.",
      tone: "warning",
    };
  }
  if (vix < 18) {
    return {
      headline: `Marchés calmes (VIX ${vix.toFixed(1)})`,
      detail: "Le VIX (indice de la peur) est faible : les investisseurs sont sereins, les mouvements de prix sont mesurés. Environnement plutôt favorable pour prendre des décisions raisonnées sans précipitation.",
      tone: "positive",
    };
  }
  if (vix < 25) {
    return {
      headline: `Volatilité modérée (VIX ${vix.toFixed(1)})`,
      detail: "Le VIX est dans une zone normale. Les investisseurs ne sont ni euphoriques ni paniqués. Pas de signal fort dans un sens ou dans l'autre — privilégier la sélection de qualité plutôt que les paris audacieux.",
      tone: "neutral",
    };
  }
  if (vix < 35) {
    return {
      headline: `Tension sur les marchés (VIX ${vix.toFixed(1)})`,
      detail: "Le VIX grimpe : les investisseurs sont inquiets. Les prix bougent plus fort dans les deux sens. Période où la patience paie — éviter les achats émotionnels, attendre que la poussière retombe.",
      tone: "warning",
    };
  }
  return {
    headline: `Marchés en stress (VIX ${vix.toFixed(1)})`,
    detail: "VIX au-dessus de 35 = panique généralisée. Les ventes massives créent souvent des opportunités historiques pour les investisseurs disciplinés, mais le risque de continuer à baisser est réel. Privilégier les sociétés solides avec bilan sain.",
    tone: "negative",
  };
}

export function explainRegime(regime: string, label: string): MacroExplanation {
  const map: Record<string, MacroExplanation> = {
    "risk-on": {
      headline: label,
      detail: "« Risk-on » = les investisseurs prennent des risques. L'argent va vers les actions de croissance, le crédit risqué, les marchés émergents. C'est le signe d'un appétit pour le rendement. Surveiller toutefois si les valorisations deviennent excessives.",
      tone: "positive",
    },
    "risk-off": {
      headline: label,
      detail: "« Risk-off » = les investisseurs fuient le risque. L'argent va vers les obligations d'État, l'or, le franc suisse, le dollar. Les actions risquées souffrent. Période où il vaut mieux protéger le capital plutôt que chercher du rendement.",
      tone: "negative",
    },
    "calme": {
      headline: label,
      detail: "Conditions de marché normales : pas de stress majeur, pas d'euphorie. Bonne période pour analyser posément, construire des positions de qualité, sans courir après les performances à court terme.",
      tone: "positive",
    },
    "vigilance": {
      headline: label,
      detail: "La volatilité monte sans que la panique soit là. Souvent un signal précurseur d'un changement de tendance. Rester investi mais éviter les nouvelles positions risquées tant que la direction n'est pas claire.",
      tone: "warning",
    },
    "neutral": {
      headline: label,
      detail: "Pas de régime dominant clair. Le marché manque de direction — privilégier la sélectivité (qualité, valorisation) plutôt que les paris directionnels.",
      tone: "neutral",
    },
  };
  return map[regime] ?? map.neutral;
}

/* ── Indices & macro indicateurs ───────────────────────────────────────── */

export interface IndicatorExplanation {
  label: string;
  detail: string;
  tone: "positive" | "negative" | "neutral" | "warning";
}

export function explainIndex(name: string, change_ytd: number, change_1m: number): IndicatorExplanation {
  const ytd = change_ytd ?? 0;
  const m = change_1m ?? 0;

  if (ytd > 10 && m > 3) {
    return {
      label: "Forte tendance haussière",
      detail: `${name} progresse de ${ytd.toFixed(1)}% depuis le début d'année et de ${m.toFixed(1)}% sur le mois. Les investisseurs sont confiants. Bon environnement pour le rendement, mais attention aux valorisations qui peuvent devenir tendues.`,
      tone: "positive",
    };
  }
  if (ytd > 0 && m > 0) {
    return {
      label: "Tendance positive modérée",
      detail: `${name} est en hausse de ${ytd.toFixed(1)}% sur l'année et ${m.toFixed(1)}% sur le mois. Pas d'euphorie, pas de stress — environnement sain pour la sélection de qualité.`,
      tone: "positive",
    };
  }
  if (ytd < -10 || m < -5) {
    return {
      label: "Marché en correction",
      detail: `${name} recule de ${ytd.toFixed(1)}% YTD et ${m.toFixed(1)}% sur le mois. Période difficile mais souvent porteuse d'opportunités sur les sociétés solides bradées.`,
      tone: "negative",
    };
  }
  return {
    label: "Mouvement latéral",
    detail: `${name} : ${ytd >= 0 ? "+" : ""}${ytd.toFixed(1)}% YTD, ${m >= 0 ? "+" : ""}${m.toFixed(1)}% sur le mois. Pas de tendance claire — privilégier la sélectivité.`,
    tone: "neutral",
  };
}

export function explainTreasury10Y(yield_pct: number, change_ytd: number): IndicatorExplanation {
  const y = yield_pct ?? 0;
  const ytd = change_ytd ?? 0;

  if (y > 5) {
    return {
      label: `Taux 10 ans US élevé (${y.toFixed(2)}%)`,
      detail: "Quand les taux d'État américains montent, le coût du crédit augmente pour toute l'économie. Les actions de croissance (tech, biotech) souffrent car leurs bénéfices futurs sont actualisés à un taux plus élevé. Bon pour les banques, mauvais pour les sociétés endettées.",
      tone: "warning",
    };
  }
  if (y > 4) {
    return {
      label: `Taux 10 ans US à ${y.toFixed(2)}%`,
      detail: "Le rendement des bons du Trésor US à 10 ans est dans une zone modérément élevée. Cela limite l'appétit pour le risque mais reste gérable. Les valorisations doivent rester raisonnables.",
      tone: "neutral",
    };
  }
  if (y < 3) {
    return {
      label: `Taux 10 ans US bas (${y.toFixed(2)}%)`,
      detail: "Les taux longs sont bas : le coût du capital est faible, ce qui dope les actions de croissance et l'immobilier. Mais si la baisse vient d'une fuite vers la sécurité, c'est plutôt un signal de peur.",
      tone: "positive",
    };
  }
  return {
    label: `Taux 10 ans US à ${y.toFixed(2)}%`,
    detail: "Le rendement des bons du Trésor US à 10 ans est le baromètre principal du coût du capital mondial. Une variation de 0,5% peut faire bouger les valorisations de 10-15%.",
    tone: "neutral",
  };
}

export function explainDollar(dxy: number, change_1m: number): IndicatorExplanation {
  const m = change_1m ?? 0;
  if (m > 3) {
    return {
      label: `Dollar fort (DXY ${dxy.toFixed(1)}, +${m.toFixed(1)}% sur 1M)`,
      detail: "Le dollar grimpe : les actions US deviennent plus chères pour les étrangers et les multinationales américaines voient leurs revenus à l'étranger réduits une fois convertis. Pénalisant pour Apple, Microsoft et les exportateurs US.",
      tone: "warning",
    };
  }
  if (m < -3) {
    return {
      label: `Dollar en baisse (DXY ${dxy.toFixed(1)}, ${m.toFixed(1)}% sur 1M)`,
      detail: "Le dollar baisse : bénéfique pour les exportateurs US et les marchés émergents qui empruntent en dollar. L'or et les matières premières (cotées en USD) ont tendance à monter.",
      tone: "positive",
    };
  }
  return {
    label: `Dollar stable (DXY ${dxy.toFixed(1)})`,
    detail: "Le Dollar Index mesure la force du dollar contre un panier de devises. Stable = pas de stress devises, environnement neutre pour les actifs internationaux.",
    tone: "neutral",
  };
}

export function explainOil(wti: number, change_ytd: number): IndicatorExplanation {
  const ytd = change_ytd ?? 0;
  if (ytd > 30) {
    return {
      label: `Pétrole en flambée (WTI ${wti.toFixed(1)}$, +${ytd.toFixed(0)}% YTD)`,
      detail: "Le pétrole monte fort : signal d'inflation, pression sur la consommation et les transports. Mauvais pour les compagnies aériennes, l'industrie, les ménages. Bon pour Exxon, Chevron, TotalEnergies.",
      tone: "warning",
    };
  }
  if (ytd < -20) {
    return {
      label: `Pétrole en baisse (WTI ${wti.toFixed(1)}$, ${ytd.toFixed(0)}% YTD)`,
      detail: "Le pétrole baisse : pression désinflationniste, bon pour la consommation et le transport. Mauvais pour les pétrolières mais positif pour les compagnies aériennes (Air France, Delta) et l'industrie lourde.",
      tone: "positive",
    };
  }
  return {
    label: `Pétrole : WTI ${wti.toFixed(1)}$ (${ytd >= 0 ? "+" : ""}${ytd.toFixed(0)}% YTD)`,
    detail: "Le pétrole WTI est l'indicateur principal de l'inflation énergétique. Une variation forte affecte toute la chaîne de valeur — du transport aux biens de consommation.",
    tone: "neutral",
  };
}

export function explainGold(gold: number, change_ytd: number): IndicatorExplanation {
  const ytd = change_ytd ?? 0;
  if (ytd > 15) {
    return {
      label: `Or en forte hausse (${gold.toFixed(0)}$, +${ytd.toFixed(0)}% YTD)`,
      detail: "L'or grimpe : les investisseurs cherchent un refuge contre l'inflation, les tensions géopolitiques ou la peur d'une récession. Souvent corrélé à la baisse du dollar. Signal de prudence sur les actifs risqués.",
      tone: "warning",
    };
  }
  if (ytd < -10) {
    return {
      label: `Or en repli (${gold.toFixed(0)}$, ${ytd.toFixed(0)}% YTD)`,
      detail: "L'or baisse : les investisseurs préfèrent les actifs productifs. Souvent signe d'un appétit pour le risque retrouvé.",
      tone: "positive",
    };
  }
  return {
    label: `Or : ${gold.toFixed(0)}$ (${ytd >= 0 ? "+" : ""}${ytd.toFixed(0)}% YTD)`,
    detail: "L'or est la valeur refuge historique. Sa progression reflète souvent la peur (inflation, géopolitique) ou la baisse du dollar.",
    tone: "neutral",
  };
}

/* ── Synthèse pédagogique : pourquoi conditions favorables ─────────────── */

export interface MarketReasoning {
  positive: string[];
  negative: string[];
  conclusion: string;
}

export function buildMarketReasoning(
  vix: number | null,
  sp500_ytd: number | null,
  sp500_1m: number | null,
  us10y: number | null,
  dxy_1m: number | null,
  wti_ytd: number | null,
  gold_ytd: number | null,
): MarketReasoning {
  const positive: string[] = [];
  const negative: string[] = [];

  if (vix != null) {
    if (vix < 18) positive.push(`VIX bas à ${vix.toFixed(1)} : peu de stress sur les marchés`);
    else if (vix > 25) negative.push(`VIX élevé à ${vix.toFixed(1)} : nervosité des investisseurs`);
  }
  if (sp500_ytd != null) {
    if (sp500_ytd > 0) positive.push(`S&P 500 +${sp500_ytd.toFixed(1)}% YTD : tendance haussière confirmée`);
    else negative.push(`S&P 500 ${sp500_ytd.toFixed(1)}% YTD : pression baissière`);
  }
  if (sp500_1m != null && sp500_1m > 3) {
    positive.push(`Momentum mensuel +${sp500_1m.toFixed(1)}% : appétit pour le risque`);
  }
  if (us10y != null) {
    if (us10y < 4.5) positive.push(`Taux 10 ans à ${us10y.toFixed(2)}% : coût du capital maîtrisé`);
    else if (us10y > 5) negative.push(`Taux 10 ans à ${us10y.toFixed(2)}% : pression sur les valorisations`);
  }
  if (dxy_1m != null) {
    if (Math.abs(dxy_1m) < 2) positive.push("Dollar stable : pas de stress devises");
    else if (dxy_1m > 3) negative.push(`Dollar fort (+${dxy_1m.toFixed(1)}% 1M) : pénalise exportateurs US`);
  }
  if (wti_ytd != null && wti_ytd > 50) {
    negative.push(`Pétrole +${wti_ytd.toFixed(0)}% YTD : pression inflationniste`);
  }
  if (gold_ytd != null && gold_ytd > 15) {
    negative.push(`Or +${gold_ytd.toFixed(0)}% YTD : signal de peur résiduelle`);
  }

  let conclusion = "";
  if (positive.length > negative.length + 1) {
    conclusion = "Bilan globalement positif. Bonne fenêtre pour analyser et entrer sur des sociétés de qualité.";
  } else if (negative.length > positive.length + 1) {
    conclusion = "Plus de signaux défavorables que favorables. Privilégier la prudence et les valeurs défensives.";
  } else {
    conclusion = "Signaux mitigés. Sélectivité plutôt que paris directionnels — qualité, valorisation raisonnable, conviction forte.";
  }
  return { positive, negative, conclusion };
}

export function explainSectorRotation(leaders?: any[], laggards?: any[]): string | null {
  if (!leaders?.length && !laggards?.length) return null;

  const top = leaders?.[0];
  const bottom = laggards?.[0];

  const parts: string[] = [];
  if (top) parts.push(`L'argent va vers ${top.sector.toLowerCase()} (${top.change_1m > 0 ? "+" : ""}${top.change_1m.toFixed(1)}% sur 1 mois)`);
  if (bottom) parts.push(`fuit ${bottom.sector.toLowerCase()} (${bottom.change_1m > 0 ? "+" : ""}${bottom.change_1m.toFixed(1)}%)`);
  if (parts.length === 0) return null;

  return parts.join(" et ") + ". Cela reflète les anticipations des investisseurs sur ce qui va marcher dans les prochains mois.";
}

/* ── Catégorisation et impact des news ──────────────────────────────────── */

export type NewsCategory = "macro" | "geopolitical" | "regulatory" | "earnings" | "deal" | "company";

export interface NewsClassification {
  category: NewsCategory;
  categoryLabel: string;
  impact: string;  // explication courte de l'impact potentiel
  isMacro: boolean;
}

const KEYWORDS_MACRO = [
  "fed", "federal reserve", "rate", "interest rate", "inflation", "cpi", "ppi",
  "ecb", "bce", "central bank", "boe", "powell", "lagarde",
  "gdp", "unemployment", "jobs report", "nonfarm", "recession", "stagflation",
];
const KEYWORDS_GEOPOLITICAL = [
  "war", "conflict", "tariff", "trade war", "sanctions", "geopolit", "russia",
  "china", "ukraine", "israel", "iran", "election", "vote", "ceasefire",
];
const KEYWORDS_REGULATORY = [
  "regulation", "law", "antitrust", "doj", "ftc", "sec", "investigat",
  "fine", "lawsuit", "court", "ruling", "approved", "approval", "ban",
];
const KEYWORDS_EARNINGS = [
  "earnings", "revenue", "guidance", "beat", "miss", "results", "quarter",
  "q1", "q2", "q3", "q4", "outlook",
];
const KEYWORDS_DEAL = [
  "acquisition", "merger", "buyback", "dividend", "spin-off", "ipo",
  "partnership", "contract", "deal",
];

export function classifyNews(title: string): NewsClassification {
  const t = title.toLowerCase();

  if (KEYWORDS_GEOPOLITICAL.some(k => t.includes(k))) {
    return {
      category: "geopolitical",
      categoryLabel: "Géopolitique",
      impact: "Les tensions géopolitiques affectent les marchés via le pétrole, les chaînes d'approvisionnement et l'aversion au risque.",
      isMacro: true,
    };
  }
  if (KEYWORDS_MACRO.some(k => t.includes(k))) {
    return {
      category: "macro",
      categoryLabel: "Macro",
      impact: "Les décisions des banques centrales et les indicateurs macro pilotent les valorisations de toutes les actions.",
      isMacro: true,
    };
  }
  if (KEYWORDS_REGULATORY.some(k => t.includes(k))) {
    return {
      category: "regulatory",
      categoryLabel: "Réglementaire",
      impact: "Une décision réglementaire peut redessiner toute une industrie en quelques heures.",
      isMacro: true,
    };
  }
  if (KEYWORDS_DEAL.some(k => t.includes(k))) {
    return {
      category: "deal",
      categoryLabel: "Opération",
      impact: "Les fusions, rachats et partenariats créent ou détruisent de la valeur immédiatement.",
      isMacro: false,
    };
  }
  if (KEYWORDS_EARNINGS.some(k => t.includes(k))) {
    return {
      category: "earnings",
      categoryLabel: "Résultats",
      impact: "Les publications de résultats fixent la trajectoire du titre pour les semaines suivantes.",
      isMacro: false,
    };
  }
  return {
    category: "company",
    categoryLabel: "Société",
    impact: "Actualité spécifique à l'entreprise pouvant affecter sa thèse d'investissement.",
    isMacro: false,
  };
}

/* ── Impacts spécifiques par contenu de news ───────────────────────────── */

interface NewsImpactRule {
  keywords: string[];      // tous les mots doivent matcher (AND)
  altKeywords?: string[];  // au moins un de ceux-là (OR)
  impact: string;
  affects?: string;        // sociétés/secteurs touchés
}

const IMPACT_RULES: NewsImpactRule[] = [
  // Fed & taux
  {
    keywords: ["rate cut"], altKeywords: ["fed", "powell", "fomc"],
    impact: "Une baisse de taux Fed dope les actions de croissance (tech, biotech) car leurs bénéfices futurs prennent de la valeur, mais réduit les marges des banques.",
    affects: "Tech ↑ · Banques ↓",
  },
  {
    keywords: ["rate hike"], altKeywords: ["fed", "powell", "fomc"],
    impact: "Une hausse de taux Fed pénalise les valeurs de croissance (tech) et les sociétés endettées, mais bénéficie aux banques (marges nettes d'intérêt en hausse).",
    affects: "Banques ↑ · Tech ↓ · Endettés ↓",
  },
  {
    keywords: ["powell"], altKeywords: ["unprecedent", "criticism", "trump"],
    impact: "Toute attaque politique sur l'indépendance de la Fed crée de l'incertitude. Les marchés détestent l'incertitude monétaire — volatilité en hausse, valeur refuge (or, franc suisse) en demande.",
    affects: "VIX ↑ · Or ↑",
  },
  {
    keywords: ["inflation"], altKeywords: ["cpi", "ppi"],
    impact: "L'inflation pilote les décisions de la Fed. Si elle accélère, hausse de taux probable (mauvais pour la tech) ; si elle ralentit, baisse de taux probable (bon pour la tech).",
    affects: "Tech sensible aux taux",
  },

  // Géopolitique
  {
    keywords: ["tariff"], altKeywords: ["china", "chine"],
    impact: "Les tarifs douaniers US-Chine pénalisent les multinationales avec exposition Chine (Apple : 20% des ventes en Chine, Tesla, Nike, Starbucks) et augmentent l'inflation US.",
    affects: "Apple, Tesla, Nike pénalisés",
  },
  {
    keywords: ["tariff"], altKeywords: ["europe", "eu"],
    impact: "Les tarifs sur l'Europe touchent particulièrement le luxe (LVMH, Hermès, Kering), l'automobile allemande (BMW, Volkswagen) et les vins/spiritueux.",
    affects: "Luxe européen, auto allemande",
  },
  {
    keywords: ["sanctions"], altKeywords: ["russia", "russie"],
    impact: "Les sanctions russes affectent l'énergie (pétrole, gaz) et les matières premières. Les pétrolières non-russes en bénéficient, le gaz européen reste sous tension.",
    affects: "Énergie ↑ · Industrie EU ↓",
  },
  {
    keywords: ["war"], altKeywords: ["middle east", "iran", "israel"],
    impact: "Les tensions au Moyen-Orient font monter le pétrole (40% de la production mondiale). L'or grimpe comme valeur refuge. Mauvais pour les compagnies aériennes (carburant) et bons pour Exxon, Chevron.",
    affects: "Pétrole ↑ · Compagnies aériennes ↓",
  },
  {
    keywords: ["ceasefire"],
    impact: "Un cessez-le-feu détend les marchés : baisse du pétrole, baisse de l'or, retour de l'appétit pour le risque. Les compagnies aériennes et les transporteurs en bénéficient.",
    affects: "Aéroports, transports ↑",
  },
  {
    keywords: ["taiwan"],
    impact: "Taïwan = 90% de la production mondiale de semi-conducteurs avancés via TSMC. Toute tension fait plonger les semi (NVDA, AMD, ASML) et tout le secteur tech qui en dépend.",
    affects: "Semi-conducteurs ↓",
  },

  // Réglementation
  {
    keywords: ["antitrust"], altKeywords: ["google", "alphabet"],
    impact: "Une procédure antitrust contre Google peut forcer une scission ou des amendes massives. Historiquement les actions baissent à court terme mais récupèrent — Microsoft 1998 a fini par doubler.",
    affects: "GOOG ↓ court terme",
  },
  {
    keywords: ["antitrust"], altKeywords: ["apple"],
    impact: "Une action antitrust contre Apple menace l'App Store (30% de commission = 25-30% des marges des Services). Risque de baisse des marges si l'App Store est forcé d'ouvrir.",
    affects: "AAPL marges Services",
  },
  {
    keywords: ["fda approval"],
    impact: "Une approbation FDA peut faire bondir une biotech de 50-200% en une journée. Les concurrents sur le même créneau peuvent en pâtir.",
    affects: "Biotech bénéficiaire ↑",
  },
  {
    keywords: ["fda"], altKeywords: ["reject", "denied", "delay"],
    impact: "Un rejet ou retard FDA peut faire chuter une biotech de 30-70%. Surveiller les concurrents qui peuvent en bénéficier.",
    affects: "Biotech rejetée ↓",
  },
  {
    keywords: ["sec"], altKeywords: ["investigation", "fine", "lawsuit"],
    impact: "Une enquête SEC crée une incertitude juridique majeure. Les actions baissent par anticipation, et les frais juridiques pèsent sur les marges pendant des mois ou années.",
    affects: "Société visée ↓",
  },
  {
    keywords: ["regulator"], altKeywords: ["ai", "artificial intelligence"],
    impact: "La régulation de l'IA peut ralentir le développement (coûts conformité) mais aussi créer des barrières à l'entrée bénéfiques aux acteurs établis (Microsoft, Google, OpenAI partenaires).",
    affects: "Big Tech IA ambivalent",
  },

  // Secteurs / sectoriel
  {
    keywords: ["meta"], altKeywords: ["capex", "ai spend"],
    impact: "Quand Meta annonce des dépenses IA massives, le marché s'inquiète des marges (Meta -10% sur l'annonce). Mais bénéfique pour Nvidia, AMD, les semi-conducteurs et les data centers (Equinix, Digital Realty).",
    affects: "Meta ↓ · NVDA, AMD ↑",
  },
  {
    keywords: ["alphabet", "google"], altKeywords: ["capex", "ai"],
    impact: "Les dépenses IA d'Alphabet (cloud, Gemini) sont vues positivement par le marché car visibles dans les revenus du cloud. Bon pour la chaîne de valeur (semi, data centers, énergie).",
    affects: "GOOG ↑ · Semi, data centers ↑",
  },
  {
    keywords: ["earnings"], altKeywords: ["beat", "raise"],
    impact: "Un dépassement des attentes + relèvement des prévisions = double positif. Le titre monte généralement de 5-15% et les concurrents directs peuvent profiter de l'effet de halo sectoriel.",
    affects: "Titre ↑ · Secteur halo",
  },
  {
    keywords: ["earnings"], altKeywords: ["miss", "warning", "guidance cut"],
    impact: "Manquer les attentes ou couper les prévisions est généralement sanctionné -10 à -25%. Les concurrents sont aussi sous pression — surveiller le secteur entier.",
    affects: "Titre ↓ · Secteur sous pression",
  },
  {
    keywords: ["acquisition"],
    impact: "L'acquéreur baisse souvent (dilution, prime payée), la cible monte (prime de rachat). Vérifier les concurrents qui pourraient devenir des cibles.",
    affects: "Cible ↑ · Acquéreur ↓ court terme",
  },
  {
    keywords: ["buyback"],
    impact: "Un programme de rachat d'actions soutient le cours et augmente le BPA mécaniquement. C'est un signal de confiance du management — généralement positif.",
    affects: "Titre ↑",
  },
  {
    keywords: ["dividend"], altKeywords: ["raise", "increase"],
    impact: "Une hausse du dividende est un signal de confiance fort sur la génération de cash. Particulièrement apprécié sur les staples et les utilities.",
    affects: "Titre ↑ · Profil défensif",
  },
];

export interface ImpactDetail {
  text: string;
  affects?: string;
}

export function getNewsImpact(title: string, summary: string = "", category: string = ""): ImpactDetail {
  const text = `${title} ${summary}`.toLowerCase();

  for (const rule of IMPACT_RULES) {
    const allKwsMatch = rule.keywords.every(k => text.includes(k.toLowerCase()));
    if (!allKwsMatch) continue;
    if (rule.altKeywords && rule.altKeywords.length > 0) {
      const anyAltMatch = rule.altKeywords.some(k => text.includes(k.toLowerCase()));
      if (!anyAltMatch) continue;
    }
    return { text: rule.impact, affects: rule.affects };
  }

  // Fallback générique par catégorie
  const generic: Record<string, string> = {
    macro:        "Les indicateurs macro pilotent les valorisations de toutes les actions. Surveiller la réaction des marchés dans les 24h suivantes.",
    geopolitical: "Les tensions géopolitiques affectent les marchés via le pétrole, les chaînes d'approvisionnement et l'aversion au risque.",
    regulatory:   "Une décision réglementaire peut redessiner toute une industrie. Vérifier qui sont les bénéficiaires et les perdants.",
    sector:       "Une dynamique sectorielle peut affecter tous les acteurs d'une industrie. Identifier les leaders et les retardataires.",
    company:      "Actualité spécifique pouvant affecter la thèse d'investissement à court ou moyen terme.",
  };
  return { text: generic[category] ?? generic.company };
}

export const CATEGORY_STYLES: Record<NewsCategory, { bg: string; text: string; border: string; icon: string }> = {
  macro:        { bg: "bg-blue-500/10",   text: "text-blue-700 dark:text-blue-400",     border: "border-blue-500/30",   icon: "🏦" },
  geopolitical: { bg: "bg-red-500/10",    text: "text-red-700 dark:text-red-400",       border: "border-red-500/30",    icon: "🌍" },
  regulatory:   { bg: "bg-violet-500/10", text: "text-violet-700 dark:text-violet-400", border: "border-violet-500/30", icon: "⚖️" },
  earnings:     { bg: "bg-amber-500/10",  text: "text-amber-700 dark:text-amber-400",   border: "border-amber-500/30",  icon: "📊" },
  deal:         { bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-500/30", icon: "🤝" },
  company:      { bg: "bg-surface-alt",   text: "text-secondary",                       border: "border-edge",          icon: "🏢" },
};
