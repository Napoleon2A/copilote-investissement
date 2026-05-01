/**
 * Portfolio Insights — analyse personnalisée du portefeuille de l'utilisateur.
 *
 * Croise ses positions, idées et picks avec les conditions macro, earnings
 * imminents, news critiques pour générer des insights vraiment personnels.
 *
 * Le but : sortir de l'analyse macro générique pour répondre à
 * "Qu'est-ce que ÇA veut dire pour MON portefeuille ?".
 */

import { TICKER_META, SectorKey, GeoRegion, GEO_LABEL, MegaTrend, TREND_LABEL, getTickerMeta } from "./tickerMeta";
import type { MarketSnapshot } from "./macroExplainer";

/* ────────────────────────────────────────────────────────────────────────
 * Sensibilités sectorielles aux facteurs macro
 * ──────────────────────────────────────────────────────────────────────── */

type Impact = "very_negative" | "negative" | "neutral" | "positive" | "very_positive";

interface SectorSensitivity {
  rates_up: Impact;       // hausse des taux (>4.5%)
  dollar_strong: Impact;  // dollar fort
  oil_high: Impact;       // pétrole en flambée
  recession: Impact;      // récession en gestation
  ai_boom: Impact;        // boom IA
}

const SECTOR_SENSITIVITY: Record<SectorKey, SectorSensitivity> = {
  tech:       { rates_up: "negative",      dollar_strong: "negative",      oil_high: "negative",      recession: "negative",      ai_boom: "very_positive" },
  semi:       { rates_up: "negative",      dollar_strong: "negative",      oil_high: "negative",      recession: "very_negative", ai_boom: "very_positive" },
  cyber:      { rates_up: "neutral",       dollar_strong: "negative",      oil_high: "neutral",       recession: "neutral",       ai_boom: "positive" },
  cloud:      { rates_up: "very_negative", dollar_strong: "negative",      oil_high: "negative",      recession: "negative",      ai_boom: "very_positive" },
  finance:    { rates_up: "very_positive", dollar_strong: "positive",      oil_high: "neutral",       recession: "very_negative", ai_boom: "neutral" },
  health:     { rates_up: "neutral",       dollar_strong: "negative",      oil_high: "neutral",       recession: "positive",      ai_boom: "neutral" },
  biotech:    { rates_up: "very_negative", dollar_strong: "negative",      oil_high: "neutral",       recession: "negative",      ai_boom: "neutral" },
  energy:     { rates_up: "neutral",       dollar_strong: "negative",      oil_high: "very_positive", recession: "negative",      ai_boom: "neutral" },
  consumer:   { rates_up: "negative",      dollar_strong: "negative",      oil_high: "very_negative", recession: "very_negative", ai_boom: "neutral" },
  staples:    { rates_up: "negative",      dollar_strong: "neutral",       oil_high: "negative",      recession: "very_positive", ai_boom: "neutral" },
  industrial: { rates_up: "neutral",       dollar_strong: "negative",      oil_high: "negative",      recession: "very_negative", ai_boom: "positive" },
  reits:      { rates_up: "very_negative", dollar_strong: "negative",      oil_high: "neutral",       recession: "very_negative", ai_boom: "neutral" },
  materials:  { rates_up: "negative",      dollar_strong: "very_negative", oil_high: "positive",      recession: "very_negative", ai_boom: "positive" },
  growth:     { rates_up: "very_negative", dollar_strong: "negative",      oil_high: "negative",      recession: "very_negative", ai_boom: "very_positive" },
  europe:     { rates_up: "neutral",       dollar_strong: "very_positive", oil_high: "neutral",       recession: "negative",      ai_boom: "neutral" },
};

const IMPACT_LABEL: Record<Impact, { text: string; emoji: string; tone: "positive" | "negative" | "neutral" }> = {
  very_positive: { text: "très favorable",   emoji: "🟢", tone: "positive" },
  positive:      { text: "favorable",        emoji: "🟢", tone: "positive" },
  neutral:       { text: "neutre",           emoji: "⚪", tone: "neutral" },
  negative:      { text: "défavorable",      emoji: "🔴", tone: "negative" },
  very_negative: { text: "très défavorable", emoji: "🔴", tone: "negative" },
};

/* ────────────────────────────────────────────────────────────────────────
 * Type des insights
 * ──────────────────────────────────────────────────────────────────────── */

export type InsightTone = "good" | "warning" | "danger" | "info";

export interface Insight {
  category: "concentration" | "sensitivity" | "earnings" | "news" | "missed" | "risk" | "suggestion";
  tone: InsightTone;
  title: string;
  detail: string;
  tickers?: string[];
}

export interface PortfolioInsightsResult {
  insights: Insight[];
  exposureBySector: Array<{ sector: SectorKey; label: string; weight: number; tickers: string[] }>;
  exposureByGeo: Array<{ geo: GeoRegion; label: string; weight: number; tickers: string[] }>;
  exposureByTrend: Array<{ trend: MegaTrend; label: string; weight: number; tickers: string[] }>;
  macroExposure: Array<{ factor: string; impact: Impact; comment: string }>;
  diversificationScore: number;  // 0-10 multifactoriel
  riskLevel: "low" | "medium" | "high";
  /** Détail du score : sectoriel, géo, position max, trends */
  scoreBreakdown: {
    sector: number;     // 0-10
    geo: number;        // 0-10
    positionMax: number; // 0-10
    trends: number;     // 0-10
  };
}

interface PortfolioInsightsInput {
  snapshot: MarketSnapshot;
  positions: Array<{ ticker: string; market_value?: number; pnl_pct?: number; sector?: string }>;
  totalValue?: number;
  ideas: Array<{ ticker: string; conviction?: string; action?: string }>;
  picks: Array<{ ticker: string; sector_group?: string; scores?: any; action_label?: string }>;
  upcomingEarnings: Array<{ ticker: string; days_until: number; name?: string }>;
  linkedNews: Array<{ title: string; ticker?: string; tickers_mentioned?: string[]; category: string }>;
}

/* ────────────────────────────────────────────────────────────────────────
 * Moteur principal
 * ──────────────────────────────────────────────────────────────────────── */

export function buildPortfolioInsights(input: PortfolioInsightsInput): PortfolioInsightsResult {
  const { snapshot, positions, totalValue, ideas, picks, upcomingEarnings, linkedNews } = input;
  const insights: Insight[] = [];

  // ── 1. EXPOSITION SECTORIELLE ──────────────────────────────────────────
  const sectorMap = new Map<SectorKey, { weight: number; tickers: string[] }>();
  let totalWeighted = 0;

  for (const p of positions) {
    const meta = TICKER_META[p.ticker.toUpperCase()];
    if (!meta?.sector) continue;
    const weight = (p.market_value && totalValue) ? (p.market_value / totalValue) * 100 : 100 / positions.length;
    totalWeighted += weight;
    const existing = sectorMap.get(meta.sector) ?? { weight: 0, tickers: [] };
    existing.weight += weight;
    if (!existing.tickers.includes(p.ticker)) existing.tickers.push(p.ticker);
    sectorMap.set(meta.sector, existing);
  }

  const exposureBySector = Array.from(sectorMap.entries())
    .map(([sector, data]) => ({
      sector,
      label: SECTOR_LABELS[sector] ?? sector,
      weight: Math.round(data.weight),
      tickers: data.tickers,
    }))
    .sort((a, b) => b.weight - a.weight);

  // ── EXPOSITION GÉOGRAPHIQUE ──────────────────────────────────────────
  const geoMap = new Map<GeoRegion, { weight: number; tickers: string[] }>();
  for (const p of positions) {
    const meta = getTickerMeta(p.ticker);
    const geo = meta.geo ?? "us";
    const weight = (p.market_value && totalValue) ? (p.market_value / totalValue) * 100 : 100 / positions.length;
    const existing = geoMap.get(geo) ?? { weight: 0, tickers: [] };
    existing.weight += weight;
    if (!existing.tickers.includes(p.ticker)) existing.tickers.push(p.ticker);
    geoMap.set(geo, existing);
  }
  const exposureByGeo = Array.from(geoMap.entries())
    .map(([geo, data]) => ({
      geo,
      label: GEO_LABEL[geo],
      weight: Math.round(data.weight),
      tickers: data.tickers,
    }))
    .sort((a, b) => b.weight - a.weight);

  // ── EXPOSITION MÉGATRENDS ────────────────────────────────────────────
  const trendMap = new Map<MegaTrend, { weight: number; tickers: string[] }>();
  for (const p of positions) {
    const meta = getTickerMeta(p.ticker);
    const weight = (p.market_value && totalValue) ? (p.market_value / totalValue) * 100 : 100 / positions.length;
    for (const trend of meta.trends ?? []) {
      const existing = trendMap.get(trend) ?? { weight: 0, tickers: [] };
      existing.weight += weight;
      if (!existing.tickers.includes(p.ticker)) existing.tickers.push(p.ticker);
      trendMap.set(trend, existing);
    }
  }
  const exposureByTrend = Array.from(trendMap.entries())
    .map(([trend, data]) => ({
      trend,
      label: TREND_LABEL[trend],
      weight: Math.round(data.weight),
      tickers: data.tickers,
    }))
    .sort((a, b) => b.weight - a.weight);

  // Concentration
  if (positions.length > 0) {
    const dominant = exposureBySector[0];
    if (dominant && dominant.weight > 60) {
      insights.push({
        category: "concentration",
        tone: dominant.weight > 80 ? "danger" : "warning",
        title: `Concentration extrême : ${dominant.weight}% en ${dominant.label}`,
        detail: `${dominant.tickers.join(", ")} représente ${dominant.weight}% du portefeuille. En cas de choc sectoriel, le portefeuille subit ce choc à plein. Diversifier sur 3-5 secteurs réduirait fortement le risque.`,
        tickers: dominant.tickers,
      });
    }
    if (positions.length === 1) {
      insights.push({
        category: "risk",
        tone: "danger",
        title: "Position unique : risque idiosyncratique majeur",
        detail: `Une seule société (${positions[0].ticker}) = exposition à 100% à ses risques propres : management, fraude, échec produit, etc. Une diversification minimum de 5-10 lignes est recommandée pour amortir ce risque non-systémique.`,
        tickers: [positions[0].ticker],
      });
    }
  }

  // ── 2. SENSIBILITÉ MACRO ──────────────────────────────────────────────
  const macroExposure: Array<{ factor: string; impact: Impact; comment: string }> = [];

  if (snapshot.us10y != null && positions.length > 0) {
    const ratesUp = snapshot.us10y > 4;
    const aggregateImpact = aggregateSectorImpact(exposureBySector, "rates_up");
    if (ratesUp) {
      macroExposure.push({
        factor: `Taux 10Y à ${snapshot.us10y.toFixed(2)}%`,
        impact: aggregateImpact,
        comment: impactToPortfolioComment(aggregateImpact, exposureBySector, "rates_up", "des taux élevés"),
      });
      if (aggregateImpact === "very_negative" || aggregateImpact === "negative") {
        insights.push({
          category: "sensitivity",
          tone: "warning",
          title: `Taux 10Y à ${snapshot.us10y.toFixed(2)}% : ton portefeuille est exposé`,
          detail: explainRateSensitivity(exposureBySector, snapshot.us10y),
        });
      }
    }
  }

  if (snapshot.wti_ytd != null && snapshot.wti_ytd > 30 && positions.length > 0) {
    const aggregateImpact = aggregateSectorImpact(exposureBySector, "oil_high");
    macroExposure.push({
      factor: `Pétrole +${snapshot.wti_ytd.toFixed(0)}% YTD`,
      impact: aggregateImpact,
      comment: impactToPortfolioComment(aggregateImpact, exposureBySector, "oil_high", "du pétrole en hausse"),
    });
    if (aggregateImpact === "very_negative" || aggregateImpact === "negative") {
      insights.push({
        category: "sensitivity",
        tone: "warning",
        title: `Pétrole +${snapshot.wti_ytd.toFixed(0)}% YTD : pression inflation sur ton portefeuille`,
        detail: "Tes positions sont sensibles à l'inflation énergétique (pression sur les marges et la consommation). Aucune exposition aux pétrolières (XOM, CVX, TTE) qui aurait permis de profiter du rallye.",
      });
    } else if (aggregateImpact === "very_positive") {
      insights.push({
        category: "sensitivity",
        tone: "good",
        title: `Pétrole +${snapshot.wti_ytd.toFixed(0)}% YTD : ton portefeuille profite du rallye`,
        detail: "Tes positions énergie/matières premières bénéficient directement de la flambée. Surveiller les sommets — les pétrolières corrigent vite quand l'OPEC change de pied.",
      });
    }
  }

  if (snapshot.dxy_1m != null && Math.abs(snapshot.dxy_1m) > 3) {
    const dollarStrong = snapshot.dxy_1m > 0;
    const aggregateImpact = aggregateSectorImpact(exposureBySector, "dollar_strong");
    if (dollarStrong) {
      macroExposure.push({
        factor: `Dollar +${snapshot.dxy_1m.toFixed(1)}% 1M`,
        impact: aggregateImpact,
        comment: impactToPortfolioComment(aggregateImpact, exposureBySector, "dollar_strong", "d'un dollar fort"),
      });
    }
  }

  // ── 3. EARNINGS IMMINENTS SUR SES TICKERS ──────────────────────────────
  const myTickers = new Set([
    ...positions.map(p => p.ticker.toUpperCase()),
    ...ideas.map(i => i.ticker.toUpperCase()),
  ]);
  const myEarnings = upcomingEarnings.filter(e => myTickers.has(e.ticker.toUpperCase()));

  for (const e of myEarnings.slice(0, 3)) {
    const isPosition = positions.some(p => p.ticker.toUpperCase() === e.ticker.toUpperCase());
    const isIdea = ideas.some(i => i.ticker.toUpperCase() === e.ticker.toUpperCase());
    const source = isPosition ? "ta position" : isIdea ? "ton idée en suivi" : "un ticker que tu suis";

    if (e.days_until === 0) {
      insights.push({
        category: "earnings",
        tone: "warning",
        title: `📊 ${e.ticker} publie ses résultats AUJOURD'HUI`,
        detail: `${e.name ?? e.ticker} publie ce soir/matin. ${source.charAt(0).toUpperCase() + source.slice(1)} sera fortement impactée — la volatilité moyenne post-earnings est de ±5-15% selon les surprises. Décision possible : couper le risque AVANT, ou laisser courir.`,
        tickers: [e.ticker],
      });
    } else if (e.days_until <= 3) {
      insights.push({
        category: "earnings",
        tone: "info",
        title: `📊 ${e.ticker} publie dans ${e.days_until}j`,
        detail: `${e.name ?? e.ticker} (${source}) — préparer la décision : tenir, alléger, ou attendre la publication. Vérifier les attentes des analystes pour calibrer ce qui serait considéré comme "beat" ou "miss".`,
        tickers: [e.ticker],
      });
    } else if (e.days_until <= 7) {
      insights.push({
        category: "earnings",
        tone: "info",
        title: `📊 ${e.ticker} publie dans ${e.days_until}j`,
        detail: `${e.name ?? e.ticker} (${source}) — pas urgent mais préparer la thèse. Lire les dernières news pour anticiper.`,
        tickers: [e.ticker],
      });
    }
  }

  // ── 4. NEWS CRITIQUES SUR SES TICKERS ──────────────────────────────────
  const NEGATIVE_KEYWORDS = ["lawsuit", "fraud", "investigation", "downgrade", "miss", "warning", "antitrust", "ban", "tariff", "decline", "loss", "fine"];
  const criticalNews: Array<{ title: string; ticker: string }> = [];

  for (const news of linkedNews.slice(0, 30)) {
    const titleLower = (news.title || "").toLowerCase();
    const isNegative = NEGATIVE_KEYWORDS.some(k => titleLower.includes(k));
    const ticker = news.ticker?.toUpperCase() ?? news.tickers_mentioned?.[0]?.toUpperCase();
    if (isNegative && ticker && myTickers.has(ticker)) {
      criticalNews.push({ title: news.title, ticker });
    }
  }

  if (criticalNews.length > 0) {
    const uniqTickers = Array.from(new Set(criticalNews.map(c => c.ticker)));
    insights.push({
      category: "news",
      tone: "warning",
      title: `⚠ ${criticalNews.length} actualité${criticalNews.length > 1 ? "s" : ""} négative${criticalNews.length > 1 ? "s" : ""} sur tes titres`,
      detail: `Sur ${uniqTickers.join(", ")}. Lire le détail dans la card "Actualité des cibles" pour évaluer si la thèse est compromise.`,
      tickers: uniqTickers,
    });
  }

  // ── 5. OPPORTUNITÉS MANQUÉES ──────────────────────────────────────────
  const myPickedTickers = new Set([...myTickers, ...picks.map(p => p.ticker.toUpperCase())]);
  const sectorsInPortfolio = new Set(exposureBySector.map(e => e.sector));

  for (const pick of picks.slice(0, 3)) {
    const meta = TICKER_META[pick.ticker.toUpperCase()];
    if (!meta?.sector) continue;
    if (!myTickers.has(pick.ticker.toUpperCase()) && !sectorsInPortfolio.has(meta.sector)) {
      const score = pick.scores?.composite;
      insights.push({
        category: "missed",
        tone: "info",
        title: `💡 Opportunité : ${pick.ticker} (${SECTOR_LABELS[meta.sector] ?? meta.sector})`,
        detail: `Le scanner a détecté ${meta.name} avec un score de ${score?.toFixed(1) ?? "?"} sur 10, action « ${pick.action_label} ». Tu n'as aucune exposition au secteur ${SECTOR_LABELS[meta.sector] ?? meta.sector} — ouvrirait une ligne de diversification.`,
        tickers: [pick.ticker],
      });
    }
  }

  // ── 6. SECTEURS ABSENTS PERFORMANTS ──────────────────────────────────
  if (positions.length > 0) {
    const importantSectors: Array<[SectorKey, string]> = [
      ["tech", "Tech"],
      ["finance", "Finance"],
      ["health", "Santé"],
      ["energy", "Énergie"],
    ];
    const missingImportant = importantSectors.filter(([s]) => !sectorsInPortfolio.has(s));
    if (missingImportant.length >= 3) {
      insights.push({
        category: "concentration",
        tone: "info",
        title: "Plusieurs grands secteurs absents du portefeuille",
        detail: `Pas d'exposition à : ${missingImportant.map(([_, l]) => l).join(", ")}. Une diversification multi-secteurs (4-6 secteurs) est généralement recommandée pour limiter les corrélations négatives.`,
      });
    }
  }

  // ── 7. POSITION MAX (règle des 25% max) ──────────────────────────────
  if (positions.length > 1 && totalValue && totalValue > 0) {
    const sorted = [...positions].sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0));
    const top = sorted[0];
    const topWeight = ((top.market_value ?? 0) / totalValue) * 100;
    if (topWeight > 25) {
      insights.push({
        category: "concentration",
        tone: topWeight > 40 ? "danger" : "warning",
        title: `Position dominante : ${top.ticker} = ${topWeight.toFixed(0)}% du portefeuille`,
        detail: `Règle classique : aucune position ne devrait dépasser 20-25% du portefeuille pour limiter le risque idiosyncratique. Actuellement ${top.ticker} pèse ${topWeight.toFixed(0)}% — un choc spécifique sur cette société impacterait directement ${topWeight.toFixed(0)}% du capital.`,
        tickers: [top.ticker],
      });
    }
  }

  // ── 8. DIVERSIFICATION GÉOGRAPHIQUE ──────────────────────────────────
  if (positions.length > 0) {
    const usWeight = exposureByGeo.find(g => g.geo === "us")?.weight ?? 0;
    const europeWeight = exposureByGeo.find(g => g.geo === "europe")?.weight ?? 0;
    const otherWeight = 100 - usWeight - europeWeight;

    if (usWeight === 100) {
      insights.push({
        category: "concentration",
        tone: "warning",
        title: "100% USA : aucune diversification géographique",
        detail: "Tout le portefeuille est exposé au dollar US, à la Fed et au cycle américain. Une diversification 60-70% US / 20-30% Europe / 0-10% émergents est généralement recommandée pour amortir les chocs régionaux et limiter le risque devise.",
      });
    } else if (usWeight > 90 && positions.length >= 3) {
      insights.push({
        category: "concentration",
        tone: "info",
        title: `${usWeight}% USA : forte concentration géographique`,
        detail: "Considérer un peu d'exposition Europe (LVMH, Sanofi, ASML) ou émergents (TSMC, Alibaba) pour amortir le risque dollar et bénéficier de cycles différents.",
      });
    }
  }

  // ── 9. COUVERTURE MÉGATRENDS ─────────────────────────────────────────
  if (positions.length > 0) {
    const trendsCovered = exposureByTrend.length;
    if (trendsCovered === 0) {
      insights.push({
        category: "concentration",
        tone: "info",
        title: "Aucune exposition aux mégatendances structurelles",
        detail: "Les mégatendances (IA, énergie verte, démographie/obésité, défense) tirent les marchés à 5-10 ans. Sans exposition, le portefeuille manque les vagues structurelles. Considérer NVDA/MSFT (IA), LLY/NVO (obésité), FSLR/ENPH (énergie verte), LMT/RTX (défense).",
      });
    } else if (trendsCovered >= 3) {
      const topTrend = exposureByTrend[0];
      if (topTrend.weight < 90) {
        insights.push({
          category: "concentration",
          tone: "good",
          title: `${trendsCovered} mégatendances couvertes`,
          detail: `Bonne diversification thématique : ${exposureByTrend.slice(0, 3).map(t => `${t.label} (${t.weight}%)`).join(", ")}. Le portefeuille est exposé à plusieurs vagues structurelles.`,
          tickers: exposureByTrend.flatMap(t => t.tickers).slice(0, 5),
        });
      }
    }
  }

  // ── 10. CONVICTION DES IDÉES ─────────────────────────────────────────
  if (ideas.length >= 3) {
    const lowConviction = ideas.filter(i => i.conviction === "faible").length;
    const lowRatio = lowConviction / ideas.length;
    if (lowRatio > 0.5) {
      insights.push({
        category: "concentration",
        tone: "info",
        title: `${lowConviction}/${ideas.length} idées en suivi avec conviction "faible"`,
        detail: `Plus de la moitié de tes idées en suivi sont taggées "faible conviction" — soit le système est conservateur sur ces tickers, soit ta base d'idées mérite d'être nettoyée. Les idées à faible conviction noient le signal des idées à forte conviction.`,
      });
    }
  }

  // ── SCORE DE DIVERSIFICATION MULTIFACTORIEL ──────────────────────────
  const scoreBreakdown = computeMultifactorScore(
    positions,
    exposureBySector,
    exposureByGeo,
    exposureByTrend,
    totalValue,
  );

  const diversificationScore = Math.round(
    (scoreBreakdown.sector * 0.30 +
     scoreBreakdown.geo * 0.20 +
     scoreBreakdown.positionMax * 0.30 +
     scoreBreakdown.trends * 0.20)
  );

  const riskLevel: "low" | "medium" | "high" =
    diversificationScore >= 7 ? "low"
    : diversificationScore >= 4 ? "medium"
    : "high";

  // Trier les insights par tonalité (danger d'abord)
  const TONE_ORDER: Record<InsightTone, number> = { danger: 0, warning: 1, info: 2, good: 3 };
  insights.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);

  return {
    insights,
    exposureBySector,
    exposureByGeo,
    exposureByTrend,
    macroExposure,
    diversificationScore,
    riskLevel,
    scoreBreakdown,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────── */

const SECTOR_LABELS: Partial<Record<SectorKey, string>> = {
  tech: "Tech", semi: "Semi", cyber: "Cyber", cloud: "Cloud",
  finance: "Finance", health: "Santé", biotech: "Biotech",
  energy: "Énergie", consumer: "Conso", staples: "Staples",
  industrial: "Industrie", reits: "REITs", materials: "Matières",
  growth: "Growth", europe: "Europe",
};

const IMPACT_SCORE: Record<Impact, number> = {
  very_negative: -2, negative: -1, neutral: 0, positive: 1, very_positive: 2,
};

function aggregateSectorImpact(
  exposure: Array<{ sector: SectorKey; weight: number }>,
  factor: keyof SectorSensitivity,
): Impact {
  if (exposure.length === 0) return "neutral";
  let totalScore = 0;
  let totalWeight = 0;
  for (const e of exposure) {
    const sensitivity = SECTOR_SENSITIVITY[e.sector];
    if (!sensitivity) continue;
    totalScore += IMPACT_SCORE[sensitivity[factor]] * e.weight;
    totalWeight += e.weight;
  }
  const avgScore = totalWeight > 0 ? totalScore / totalWeight : 0;
  if (avgScore <= -1.5) return "very_negative";
  if (avgScore <= -0.4) return "negative";
  if (avgScore <  0.4)  return "neutral";
  if (avgScore <  1.5)  return "positive";
  return "very_positive";
}

function impactToPortfolioComment(
  impact: Impact,
  exposure: Array<{ sector: SectorKey; label: string; weight: number }>,
  _factor: string,
  context: string,
): string {
  const top = exposure[0];
  if (impact === "very_positive" || impact === "positive") {
    return `Ton portefeuille (${top?.label} ${top?.weight}%) bénéficie ${context}.`;
  }
  if (impact === "very_negative" || impact === "negative") {
    return `Ton portefeuille (${top?.label} ${top?.weight}%) souffre ${context}.`;
  }
  return `Ton portefeuille est globalement insensible ${context}.`;
}

function explainRateSensitivity(
  exposure: Array<{ sector: SectorKey; label: string; weight: number }>,
  rate: number,
): string {
  const sensitive = exposure.filter(e =>
    ["tech", "cloud", "biotech", "growth", "reits"].includes(e.sector)
  );
  if (sensitive.length === 0) return `Taux à ${rate.toFixed(2)}% : pas d'impact direct sur tes positions actuelles.`;
  const total = sensitive.reduce((s, e) => s + e.weight, 0);
  return `${total}% de ton portefeuille (${sensitive.map(s => `${s.label} ${s.weight}%`).join(", ")}) est en secteurs très sensibles aux taux longs. Les valuations de croissance sont actualisées à ${rate.toFixed(2)}% — chaque hausse de 0.5pt du taux comprime mécaniquement les multiples de 10-15%.`;
}

/**
 * Score multifactoriel : 4 dimensions pondérées.
 * Chaque dimension est notée 0-10 et le score final est une moyenne pondérée.
 */
function computeMultifactorScore(
  positions: Array<{ ticker: string; market_value?: number }>,
  exposureBySector: Array<{ weight: number }>,
  exposureByGeo: Array<{ weight: number }>,
  exposureByTrend: Array<{ weight: number }>,
  totalValue?: number,
): { sector: number; geo: number; positionMax: number; trends: number } {
  if (positions.length === 0) return { sector: 0, geo: 0, positionMax: 0, trends: 0 };
  if (positions.length === 1) return { sector: 1, geo: 0, positionMax: 0, trends: 1 };

  // 1. Score sectoriel (Herfindahl + bonus nombre)
  const sectorHhi = exposureBySector.reduce((s, e) => s + Math.pow(e.weight / 100, 2), 0);
  const sectorBase = (1 - sectorHhi) * 10;
  const sectorCountBonus = Math.min(exposureBySector.length / 5, 1) * 2;
  const sectorScore = Math.min(10, sectorBase + sectorCountBonus);

  // 2. Score géographique (idéal : 70% US + 30% Europe/Émergents)
  const geoHhi = exposureByGeo.reduce((s, e) => s + Math.pow(e.weight / 100, 2), 0);
  const geoBase = (1 - geoHhi) * 10;
  // Bonus si 2-3 régions couvertes
  const geoCountBonus = exposureByGeo.length >= 2 ? 2 : 0;
  const geoScore = Math.min(10, geoBase + geoCountBonus);

  // 3. Score de concentration max (pénalise toute position > 25%)
  let positionMaxScore = 10;
  if (totalValue && totalValue > 0) {
    const maxWeight = Math.max(...positions.map(p => ((p.market_value ?? 0) / totalValue) * 100));
    if (maxWeight > 50) positionMaxScore = 0;
    else if (maxWeight > 35) positionMaxScore = 3;
    else if (maxWeight > 25) positionMaxScore = 5;
    else if (maxWeight > 15) positionMaxScore = 8;
    else positionMaxScore = 10;
  } else if (positions.length === 1) {
    positionMaxScore = 0;
  } else {
    positionMaxScore = Math.min(10, positions.length * 1.5);
  }

  // 4. Score mégatendances (bonus si 2-4 trends couvertes)
  const trendsCount = exposureByTrend.length;
  let trendsScore = 0;
  if (trendsCount === 0) trendsScore = 2;       // Manque structurel
  else if (trendsCount === 1) trendsScore = 5;  // Mono-trend
  else if (trendsCount === 2) trendsScore = 7;  // OK
  else if (trendsCount === 3) trendsScore = 9;  // Bonne diversité
  else trendsScore = 10;                        // Excellent

  return {
    sector: Math.round(sectorScore),
    geo: Math.round(geoScore),
    positionMax: Math.round(positionMaxScore),
    trends: Math.round(trendsScore),
  };
}
