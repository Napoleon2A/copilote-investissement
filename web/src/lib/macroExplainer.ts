/**
 * Vulgarisation du contexte macro pour non-trader.
 * Convertit les indicateurs techniques (VIX, régime, etc.) en explications claires.
 *
 * Les fonctions "Contextual" prennent un MarketSnapshot complet et croisent
 * plusieurs signaux pour détecter les anomalies (ex: VIX bas + pétrole en flambée).
 */

export interface MacroExplanation {
  headline: string;       // 1 phrase claire
  detail: string;         // explication pédagogique
  tone: "positive" | "negative" | "neutral" | "warning";
}

export interface MarketSnapshot {
  vix: number | null;
  vix_change_1m?: number | null;
  sp500_price?: number | null;
  sp500_ytd: number | null;
  sp500_1m: number | null;
  nasdaq_ytd?: number | null;
  nasdaq_1m?: number | null;
  cac40_ytd?: number | null;
  cac40_1m?: number | null;
  us10y: number | null;
  us10y_1m_change?: number | null;
  dxy: number | null;
  dxy_1m: number | null;
  gold_ytd: number | null;
  wti_ytd: number | null;
  wti_1m?: number | null;
  // Indicateurs pros : signal récession, stress obligataire, conviction croissance, broad rally
  rut_1m?: number | null;            // Russell 2000 1M (small caps US)
  move?: number | null;              // MOVE index (volatilité bonds)
  spread_10y_3m?: number | null;     // Spread courbe 10Y-3M (en points)
  copper_gold_1m?: number | null;    // Ratio cuivre/or 1M (cyclique vs défensif)
}

/* ── Moyennes historiques (référence pour calibrage) ──────────────────── */
const HIST = {
  VIX_AVG_30Y: 19.5,           // VIX moyenne 1990-2024
  SP500_ANNUAL_AVG: 10.5,      // S&P 500 perf annuelle moyenne 1928-2024
  NASDAQ_ANNUAL_AVG: 12.0,     // NASDAQ moyenne 1971-2024
  US10Y_AVG_10Y: 2.8,          // Taux 10 ans moyen 2014-2024
  DXY_NORMAL_RANGE: [92, 105], // Dollar Index zone normale
};

export function explainVix(vix: number | null | undefined): MacroExplanation | null {
  if (vix == null) return null;

  // Versions simples non utilisées — la fonction explainVixContextual avec snapshot
  // est utilisée à la place dans le code de production.
  if (vix < 18) return { headline: `VIX ${vix.toFixed(1)}`, detail: "", tone: "positive" };
  if (vix < 25) return { headline: `VIX ${vix.toFixed(1)}`, detail: "", tone: "neutral" };
  if (vix < 35) return { headline: `VIX ${vix.toFixed(1)}`, detail: "", tone: "warning" };
  return { headline: `VIX ${vix.toFixed(1)}`, detail: "", tone: "negative" };
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
  // Indicateurs pros (optionnels pour rétro-compatibilité)
  rut_1m?: number | null,
  move?: number | null,
  spread_10y_3m?: number | null,
  copper_gold_1m?: number | null,
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

  // ── Spread 10Y-3M (signal récession Fed NY) ──
  if (spread_10y_3m != null) {
    if (spread_10y_3m < 0) {
      negative.push(`Courbe inversée (10Y-3M = ${spread_10y_3m.toFixed(2)} pts) : signal historique de récession 12-18 mois (modèle Fed NY)`);
    } else if (spread_10y_3m > 1.5) {
      positive.push(`Courbe pentue (10Y-3M = +${spread_10y_3m.toFixed(2)} pts) : conditions de crédit normalisées, pas de signal récession`);
    }
  }

  // ── Russell 2000 vs S&P (broad rally vs concentré) ──
  if (rut_1m != null && sp500_1m != null) {
    const diff = rut_1m - sp500_1m;
    if (diff > 2) {
      positive.push(`Russell 2000 surperforme le S&P de ${diff.toFixed(1)} pts sur 1M : élargissement du rally aux small caps US`);
    } else if (diff < -3) {
      negative.push(`Russell 2000 sous-performe le S&P de ${Math.abs(diff).toFixed(1)} pts sur 1M : inquiétude sur l'économie domestique US`);
    }
  }

  // ── MOVE index (volatilité obligataire, annonciateur du VIX) ──
  if (move != null) {
    if (move > 130) {
      negative.push(`MOVE à ${move.toFixed(0)} : forte volatilité sur les taux, stress qui précède souvent celui des actions`);
    } else if (move < 80) {
      positive.push(`MOVE à ${move.toFixed(0)} : marché obligataire calme, pas de stress en amont`);
    }
  }

  // ── Cuivre/Or ratio (cyclique vs défensif) ──
  if (copper_gold_1m != null) {
    if (copper_gold_1m > 3) {
      positive.push(`Cuivre/Or +${copper_gold_1m.toFixed(1)}% sur 1M : conviction croissance retrouvée (rotation cyclique)`);
    } else if (copper_gold_1m < -3) {
      negative.push(`Cuivre/Or ${copper_gold_1m.toFixed(1)}% sur 1M : rotation défensive vers les valeurs refuge`);
    }
  }

  // Conclusion factuelle : on nomme le signal dominant + le contrepoids principal s'il existe
  let conclusion = "";
  if (positive.length > negative.length + 1) {
    conclusion = positive[0];
    if (negative.length > 0) conclusion += `. Bémol : ${negative[0]}`;
    conclusion += ".";
  } else if (negative.length > positive.length + 1) {
    conclusion = negative[0];
    if (positive.length > 0) conclusion += `. Mais : ${positive[0]}`;
    conclusion += ".";
  } else if (positive.length > 0 && negative.length > 0) {
    conclusion = `${positive[0]}. Cependant : ${negative[0]}.`;
  } else if (positive.length > 0) {
    conclusion = `${positive[0]}.`;
  } else if (negative.length > 0) {
    conclusion = `${negative[0]}.`;
  } else {
    conclusion = "Données macro insuffisantes pour conclure.";
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

  /* ── Règles supplémentaires : géopolitique avancée ── */
  {
    keywords: ["nato"], altKeywords: ["expansion", "membership"],
    impact: "Toute évolution de l'OTAN affecte l'équilibre géopolitique européen. Bénéficie aux valeurs de défense (Lockheed, RTX, Airbus) et peut peser sur l'énergie russe et les marchés émergents proches.",
    affects: "Défense ↑ · Énergie russe ↓",
  },
  {
    keywords: ["opec"], altKeywords: ["cut", "production"],
    impact: "Les coupes de production OPEC font monter le pétrole, profitant aux pétrolières (Exxon, Chevron, TotalEnergies) mais pesant sur les compagnies aériennes, l'automobile et la consommation.",
    affects: "Pétrolières ↑ · Aérien ↓",
  },
  {
    keywords: ["yuan"], altKeywords: ["devaluation", "weak", "fall"],
    impact: "Un yuan faible rend les exportations chinoises plus compétitives mais augmente la pression déflationniste mondiale. Pénalise les exportateurs européens (luxe, auto allemande, semi-conducteurs).",
    affects: "Exportateurs UE ↓",
  },
  {
    keywords: ["bank of japan"], altKeywords: ["intervention", "yen"],
    impact: "Une intervention de la BoJ sur le yen recalibre les flux de carry trade mondiaux. Peut déclencher des ventes massives sur les actifs risqués (tech US, marchés émergents).",
    affects: "Actifs risqués sensibles",
  },

  /* ── Tech & IA ── */
  {
    keywords: ["openai"],
    impact: "Tout ce qui touche OpenAI affecte directement Microsoft (partenaire principal) et indirectement Nvidia (puces), Google/Anthropic (concurrents), Meta (open-source LLaMA).",
    affects: "MSFT, NVDA, GOOG affectés",
  },
  {
    keywords: ["nvidia"], altKeywords: ["earnings", "demand"],
    impact: "Nvidia est le baromètre principal de l'IA. Une beat/miss dicte la trajectoire de tous les semi-conducteurs IA (AMD, ASML, Marvell) et des hyperscalers (MSFT, GOOG, META).",
    affects: "Toute la chaîne IA",
  },
  {
    keywords: ["semiconductor"], altKeywords: ["shortage", "supply"],
    impact: "Une pénurie de semi-conducteurs ralentit l'auto (Tesla, BMW), l'électronique (Apple) mais profite aux fondeurs avec capacité (TSMC, Samsung, Intel).",
    affects: "TSMC ↑ · Auto, Apple ↓",
  },
  {
    keywords: ["chip"], altKeywords: ["export", "restrict", "ban"],
    impact: "Les restrictions d'export de puces vers la Chine pénalisent Nvidia et AMD (~25% des ventes en Chine) et obligent les Chinois à se tourner vers leurs propres fondeurs (SMIC).",
    affects: "NVDA, AMD ↓ · SMIC ↑",
  },

  /* ── Énergie ── */
  {
    keywords: ["solar"], altKeywords: ["subsid", "incentive", "tariff"],
    impact: "Les subventions au solaire profitent aux fabricants américains (First Solar, Enphase) et chinois (Longi). Les tarifs sur les panneaux chinois protègent les Américains.",
    affects: "FSLR, ENPH affectés",
  },
  {
    keywords: ["nuclear"], altKeywords: ["restart", "reactor", "approval"],
    impact: "Le retour du nucléaire bénéficie aux uraniers (Cameco, Kazatomprom), aux constructeurs (Westinghouse) et aux utilities qui rouvrent (Constellation, Vistra).",
    affects: "Uranium ↑ · Utilities ↑",
  },

  /* ── Devises & Macro ── */
  {
    keywords: ["recession"], altKeywords: ["confirm", "official", "declared"],
    impact: "Une récession confirmée déclenche un repli sur les défensives (Coca-Cola, P&G, utilities) et l'or. Les cycliques (auto, banque, tech) souffrent fortement.",
    affects: "Défensives ↑ · Cycliques ↓",
  },
  {
    keywords: ["yield curve"], altKeywords: ["invert", "inversion"],
    impact: "Une inversion de la courbe des taux est historiquement précurseur de récession (12-18 mois). Signal de prudence, rotation vers défensives et qualité.",
    affects: "Signal récession",
  },
  {
    keywords: ["debt ceiling"],
    impact: "Toute crise du plafond de la dette US fait monter le VIX, baisser le dollar, monter l'or. Les bons du Trésor courts paniquent. Effet temporaire mais brutal.",
    affects: "VIX ↑ · USD ↓",
  },

  /* ── M&A & corporate ── */
  {
    keywords: ["bid"], altKeywords: ["hostile", "rejected"],
    impact: "Une OPA hostile fait bondir la cible et baisser l'acquéreur. Si la cible refuse, surveiller les concurrents qui pourraient surenchérir.",
    affects: "Cible ↑ fortement",
  },
  {
    keywords: ["spin-off"],
    impact: "Une scission isole une activité pour la valoriser séparément. Le titre principal monte généralement (recentrage), la nouvelle entité dépend de sa thèse propre.",
    affects: "Titre principal ↑",
  },
  {
    keywords: ["activist"], altKeywords: ["investor", "stake"],
    impact: "L'arrivée d'un investisseur activiste annonce des changements (cessions, buyback, board change). Hausse temporaire du titre, le succès dépend de la qualité du management.",
    affects: "Titre ↑ court terme",
  },

  /* ── Réglementations spécifiques ── */
  {
    keywords: ["dma"], altKeywords: ["digital markets"],
    impact: "Le Digital Markets Act européen force l'ouverture des plateformes (App Store, Play Store). Pénalise Apple/Google (perte de commission 30%) et bénéficie aux développeurs tiers.",
    affects: "AAPL marges, GOOG affectés",
  },
  {
    keywords: ["ai act"], altKeywords: ["eu", "regulation"],
    impact: "Le règlement IA européen impose des obligations de transparence et de supervision. Coûts de conformité pour OpenAI, Microsoft, Google, mais barrière à l'entrée pour les concurrents.",
    affects: "Coûts conformité IA ↑",
  },

  /* ── Earnings spécifiques ── */
  {
    keywords: ["margin"], altKeywords: ["compression", "decline"],
    impact: "Une compression de marges signale soit pression sur les prix, soit hausse des coûts. Sanctionné fortement, surtout sur les valeurs de croissance avec multiples élevés.",
    affects: "Titre ↓ · Multiples sous pression",
  },
  {
    keywords: ["forward guidance"], altKeywords: ["raised", "increase"],
    impact: "Un relèvement des prévisions trimestrielles est l'un des signaux les plus puissants. Le titre monte généralement de 5-15% et entraîne le secteur dans son sillage.",
    affects: "Titre + secteur ↑",
  },
  {
    keywords: ["forward guidance"], altKeywords: ["cut", "lower"],
    impact: "Un abaissement des prévisions est sanctionné brutalement (-10 à -25%). Effet de halo négatif sur les concurrents directs.",
    affects: "Titre + secteur ↓",
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

/* ════════════════════════════════════════════════════════════════════════
 * Fonctions contextuelles — analyses enrichies cross-asset avec moyennes hist.
 * ════════════════════════════════════════════════════════════════════════ */

/* ── VIX contextuel ─────────────────────────────────────────────────── */
export function explainVixContextual(snap: MarketSnapshot): MacroExplanation | null {
  const vix = snap.vix;
  if (vix == null) return null;

  const dev = ((vix - HIST.VIX_AVG_30Y) / HIST.VIX_AVG_30Y) * 100;
  const devSign = dev < 0 ? "sous" : "au-dessus de";
  const headline = `VIX ${vix.toFixed(1)} (${dev < 0 ? "−" : "+"}${Math.abs(dev).toFixed(0)}% vs moyenne historique 19.5)`;

  // Construction du detail
  const parts: string[] = [];
  parts.push(`VIX (« indice de la peur ») à ${vix.toFixed(1)}, ${Math.abs(dev).toFixed(0)}% ${devSign} sa moyenne 30 ans (${HIST.VIX_AVG_30Y}).`);

  // Anomalies cross-asset
  const anomalies: string[] = [];
  if (vix < 18 && snap.wti_ytd != null && snap.wti_ytd > 50) {
    anomalies.push(`pétrole en flambée (+${snap.wti_ytd.toFixed(0)}% YTD) annonce de l'inflation à venir → la sérénité du VIX est suspecte`);
  }
  if (vix < 18 && snap.gold_ytd != null && snap.gold_ytd > 15) {
    anomalies.push(`or à +${snap.gold_ytd.toFixed(0)}% YTD : les institutionnels se couvrent malgré le calme apparent`);
  }
  if (vix < 14) {
    anomalies.push(`niveau historiquement bas — les périodes de complaisance extrême ont précédé les chutes de février 2018, février 2020 et août 2024`);
  }
  if (vix > 25 && snap.sp500_ytd != null && snap.sp500_ytd > 0) {
    anomalies.push(`S&P toujours en hausse (+${snap.sp500_ytd.toFixed(1)}% YTD) malgré la nervosité — résilience ou faux calme`);
  }
  if (snap.vix_change_1m != null && snap.vix_change_1m < -25) {
    anomalies.push(`VIX a chuté de ${Math.abs(snap.vix_change_1m).toFixed(0)}% sur 1 mois → décompression rapide après un stress, retour à la prise de risque`);
  }

  if (anomalies.length > 0) {
    parts.push("⚠ " + anomalies.join(". ") + ".");
  } else if (vix < 18) {
    parts.push("Pas d'anomalie cross-asset détectée — environnement cohérent pour l'analyse posée.");
  } else if (vix > 30) {
    parts.push("Stress élevé — historiquement, les fonds disciplinés profitent de ces fenêtres pour entrer sur la qualité.");
  }

  // Tone
  let tone: MacroExplanation["tone"] = "neutral";
  if (anomalies.length > 0) tone = "warning";
  else if (vix < 14) tone = "warning";
  else if (vix < 18) tone = "positive";
  else if (vix < 25) tone = "neutral";
  else if (vix < 35) tone = "warning";
  else tone = "negative";

  return { headline, detail: parts.join(" "), tone };
}

/* ── Indice contextuel (S&P, NASDAQ, CAC40) ──────────────────────────── */
export function explainIndexContextual(
  name: string,
  shortName: string,
  ytd: number | null,
  m1: number | null,
  histAvg = HIST.SP500_ANNUAL_AVG,
): MacroExplanation {
  if (ytd == null) {
    return { headline: name, detail: "Données indisponibles.", tone: "neutral" };
  }

  // Année écoulée vs annuelle
  const today = new Date();
  const yearProgress = (today.getMonth() * 30 + today.getDate()) / 360; // approx
  const expectedYtd = histAvg * yearProgress;
  const advance = ytd - expectedYtd;

  const parts: string[] = [];
  parts.push(`${name} : ${ytd >= 0 ? "+" : ""}${ytd.toFixed(1)}% YTD${m1 != null ? `, ${m1 >= 0 ? "+" : ""}${m1.toFixed(1)}% sur le mois` : ""}.`);

  if (Math.abs(advance) < 2) {
    parts.push(`En ligne avec sa trajectoire historique (moy. annuelle ${histAvg}%).`);
  } else if (advance > 0) {
    parts.push(`Au-dessus de sa trajectoire moyenne (moy. annuelle ${histAvg}%, attendu ~${expectedYtd.toFixed(1)}% à cette date).`);
  } else {
    parts.push(`En retard sur sa trajectoire moyenne (moy. annuelle ${histAvg}%, attendu ~${expectedYtd.toFixed(1)}% à cette date).`);
  }

  if (m1 != null && Math.abs(m1) > 5) {
    parts.push(m1 > 0
      ? `Forte accélération sur le mois : +${m1.toFixed(1)}%.`
      : `Correction marquée sur le mois : ${m1.toFixed(1)}%.`);
  }

  let tone: MacroExplanation["tone"] = "neutral";
  if (ytd > histAvg * 1.5) tone = "warning";       // Gros bull = risque de retournement
  else if (ytd > 0 && advance > 0) tone = "positive";
  else if (ytd < -10) tone = "negative";
  else if (ytd < 0) tone = "warning";

  return {
    headline: `${shortName} ${ytd >= 0 ? "+" : ""}${ytd.toFixed(1)}% YTD`,
    detail: parts.join(" "),
    tone,
  };
}

/* ── Taux 10Y contextuel ─────────────────────────────────────────────── */
export function explainTreasury10YContextual(snap: MarketSnapshot): MacroExplanation | null {
  const y = snap.us10y;
  if (y == null) return null;

  const dev = ((y - HIST.US10Y_AVG_10Y) / HIST.US10Y_AVG_10Y) * 100;
  const headline = `US 10Y ${y.toFixed(2)}% (${dev > 0 ? "+" : ""}${dev.toFixed(0)}% vs moy. 10 ans 2.8%)`;

  const parts: string[] = [];
  parts.push(`Rendement à ${y.toFixed(2)}%, soit ${Math.abs(dev).toFixed(0)}% ${dev > 0 ? "au-dessus de" : "sous"} sa moyenne décennale (2.8%).`);

  // Pression sur valorisations
  if (y > 4.5) {
    parts.push("Coût du capital élevé : pénalise les valeurs de croissance (tech, biotech, immobilier) car leurs bénéfices futurs sont actualisés plus lourdement. Bénéfique aux banques (marges nettes d'intérêt en hausse).");
  } else if (y > 3.5) {
    parts.push("Zone modérément tendue : les multiples des actions de croissance restent sous pression mais gérable.");
  } else if (y < 2.5) {
    parts.push("Coût du capital bas : dope les actions de croissance et l'immobilier. Mais si la baisse vient d'une fuite vers la sécurité, signal de peur sous-jacent.");
  }

  // Mouvement récent
  if (snap.us10y_1m_change != null && Math.abs(snap.us10y_1m_change) > 0.3) {
    parts.push(snap.us10y_1m_change > 0
      ? `Hausse rapide de ${snap.us10y_1m_change.toFixed(2)} pt sur 1 mois → signal de tension, à surveiller.`
      : `Baisse de ${Math.abs(snap.us10y_1m_change).toFixed(2)} pt sur 1 mois → détente du coût du capital.`);
  }

  let tone: MacroExplanation["tone"] = "neutral";
  if (y > 5) tone = "negative";
  else if (y > 4.5) tone = "warning";
  else if (y > 3 && y < 4) tone = "positive";
  else if (y < 2) tone = "warning"; // peur

  return { headline, detail: parts.join(" "), tone };
}

/* ── Dollar contextuel ──────────────────────────────────────────────── */
export function explainDollarContextual(snap: MarketSnapshot): MacroExplanation | null {
  const d = snap.dxy;
  if (d == null) return null;

  const [low, high] = HIST.DXY_NORMAL_RANGE;
  const inRange = d >= low && d <= high;
  const m1 = snap.dxy_1m ?? 0;

  const headline = `Dollar Index ${d.toFixed(1)} ${m1 >= 0 ? "(+" : "("}${m1.toFixed(1)}% 1M)`;

  const parts: string[] = [];
  parts.push(`DXY à ${d.toFixed(1)}, ${inRange ? "dans sa zone normale (92-105)" : d > high ? "au-dessus de sa zone normale" : "sous sa zone normale"}.`);

  if (m1 > 3) {
    parts.push("Dollar fort sur 1 mois : les multinationales US perdent en compétitivité (Apple, Microsoft, Coca-Cola : ~50% des ventes hors USA), pénalise les marchés émergents qui empruntent en USD.");
  } else if (m1 < -3) {
    parts.push("Dollar en baisse sur 1 mois : bénéficie aux exportateurs US, soutient les marchés émergents et l'or (corrélation négative).");
    if (snap.gold_ytd != null && snap.gold_ytd > 10) {
      parts.push(`Cohérent avec l'or à +${snap.gold_ytd.toFixed(0)}% YTD.`);
    }
  } else {
    parts.push("Mouvement modéré sur 1 mois : pas de stress devises particulier.");
  }

  const tone: MacroExplanation["tone"] = m1 > 4 ? "warning" : m1 < -4 ? "warning" : "neutral";
  return { headline, detail: parts.join(" "), tone };
}

/* ── Or contextuel ──────────────────────────────────────────────────── */
export function explainGoldContextual(snap: MarketSnapshot): MacroExplanation | null {
  const g_ytd = snap.gold_ytd;
  if (g_ytd == null) return null;

  const headline = `Or ${g_ytd >= 0 ? "+" : ""}${g_ytd.toFixed(1)}% YTD`;
  const parts: string[] = [];

  if (g_ytd > 20) {
    parts.push(`Forte hausse de l'or (+${g_ytd.toFixed(0)}% YTD) — les institutionnels et banques centrales achètent comme valeur refuge.`);
    if (snap.vix != null && snap.vix < 20) {
      parts.push(`Curieusement le VIX reste calme (${snap.vix.toFixed(1)}) : décorrélation à surveiller — soit l'or anticipe l'inflation, soit le marché actions sous-estime le risque.`);
    }
  } else if (g_ytd > 10) {
    parts.push(`Hausse modérée (+${g_ytd.toFixed(0)}%) — soit anticipation d'inflation, soit faiblesse du dollar (qui sont liées).`);
  } else if (g_ytd < -10) {
    parts.push(`Baisse marquée (${g_ytd.toFixed(0)}% YTD) — appétit pour le risque retrouvé, les investisseurs préfèrent les actifs productifs.`);
  } else {
    parts.push(`Variation contenue (${g_ytd.toFixed(0)}%) — pas de signal de stress refuge particulier.`);
  }

  const tone: MacroExplanation["tone"] = g_ytd > 20 ? "warning" : g_ytd < -10 ? "positive" : "neutral";
  return { headline, detail: parts.join(" "), tone };
}

/* ── Pétrole contextuel ─────────────────────────────────────────────── */
export function explainOilContextual(snap: MarketSnapshot): MacroExplanation | null {
  const oil_ytd = snap.wti_ytd;
  if (oil_ytd == null) return null;

  const headline = `Pétrole WTI ${oil_ytd >= 0 ? "+" : ""}${oil_ytd.toFixed(0)}% YTD`;
  const parts: string[] = [];

  if (oil_ytd > 50) {
    parts.push(`Flambée du brut (+${oil_ytd.toFixed(0)}% YTD) — pression inflationniste majeure, attendue dans le CPI à venir.`);
    parts.push("Bénéficiaires : Exxon, Chevron, TotalEnergies, Shell (pétrolières). Pénalisés : compagnies aériennes (Delta, Air France), transport (FedEx, UPS), industrie lourde, consommation discrétionnaire.");
    if (snap.us10y != null && snap.us10y > 4) {
      parts.push(`Combiné avec les taux 10 ans à ${snap.us10y.toFixed(1)}%, l'environnement macro reste tendu.`);
    }
  } else if (oil_ytd > 20) {
    parts.push(`Hausse soutenue (+${oil_ytd.toFixed(0)}% YTD) — vigilance sur l'inflation, surtout si les coupes OPEC se prolongent.`);
  } else if (oil_ytd < -20) {
    parts.push(`Effondrement du brut (${oil_ytd.toFixed(0)}% YTD) — souvent signal de demande mondiale faible (récession en gestation) ou surplus d'offre.`);
    parts.push("Bénéficiaires : aérien, transport, consommation. Pénalisés : pétrolières.");
  } else {
    parts.push(`Variation modérée (${oil_ytd.toFixed(0)}% YTD) — pas de signal énergie/inflation marquant.`);
  }

  const tone: MacroExplanation["tone"] = oil_ytd > 40 ? "warning" : oil_ytd < -20 ? "warning" : "neutral";
  return { headline, detail: parts.join(" "), tone };
}

/* ── Régime contextuel — utilise tout le snapshot ────────────────────── */
export function explainRegimeContextual(
  regime: string,
  label: string,
  snap: MarketSnapshot,
): MacroExplanation {
  const parts: string[] = [];

  // Citation des chiffres réels au lieu de phrases bateau
  if (snap.vix != null && snap.sp500_ytd != null) {
    parts.push(`VIX à ${snap.vix.toFixed(1)} et S&P à ${snap.sp500_ytd >= 0 ? "+" : ""}${snap.sp500_ytd.toFixed(1)}% YTD : cohérent avec un régime "${label}".`);
  }

  // Détection d'anomalies cross-asset
  const anomalies: string[] = [];
  if (regime === "calme" || regime === "risk-on") {
    if (snap.wti_ytd != null && snap.wti_ytd > 50) {
      anomalies.push(`pétrole +${snap.wti_ytd.toFixed(0)}% YTD = inflation latente non encore digérée`);
    }
    if (snap.gold_ytd != null && snap.gold_ytd > 15) {
      anomalies.push(`or +${snap.gold_ytd.toFixed(0)}% YTD = couverture institutionnelle malgré la sérénité`);
    }
    if (snap.us10y != null && snap.us10y > 4.5) {
      anomalies.push(`taux 10 ans à ${snap.us10y.toFixed(2)}% = coût du capital tendu, pression sur les multiples`);
    }
  }
  if (regime === "risk-off" || regime === "vigilance") {
    if (snap.sp500_ytd != null && snap.sp500_ytd > 0) {
      anomalies.push(`S&P toujours positif (+${snap.sp500_ytd.toFixed(1)}% YTD) malgré la nervosité — résilience à confirmer`);
    }
  }

  if (anomalies.length > 0) {
    parts.push(`⚠ Mais attention : ${anomalies.join(" ; ")}.`);
  }

  // (anciens conseils bateau supprimés — on garde seulement les faits chiffrés et anomalies)

  const tone: MacroExplanation["tone"] =
    anomalies.length > 1 ? "warning" :
    regime === "risk-off" ? "negative" :
    regime === "vigilance" ? "warning" :
    regime === "calme" || regime === "risk-on" ? "positive" : "neutral";

  return {
    headline: label,
    detail: parts.join(" "),
    tone,
  };
}
