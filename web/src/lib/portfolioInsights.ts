/**
 * Portfolio Insights — analyse personnalisée du portefeuille de l'utilisateur.
 *
 * Croise ses positions, idées et picks avec les conditions macro, earnings
 * imminents, news critiques pour générer des insights vraiment personnels.
 *
 * Le but : sortir de l'analyse macro générique pour répondre à
 * "Qu'est-ce que ÇA veut dire pour MON portefeuille ?".
 */

import { TICKER_META, SectorKey } from "./tickerMeta";
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
  macroExposure: Array<{ factor: string; impact: Impact; comment: string }>;
  diversificationScore: number;  // 0-10
  riskLevel: "low" | "medium" | "high";
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

  // ── 7. SCORE DE DIVERSIFICATION ──────────────────────────────────────
  const diversificationScore = computeDiversificationScore(positions.length, exposureBySector);
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
    macroExposure,
    diversificationScore,
    riskLevel,
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

function computeDiversificationScore(
  nbPositions: number,
  exposure: Array<{ weight: number }>,
): number {
  if (nbPositions === 0) return 0;
  if (nbPositions === 1) return 1;

  // Score basé sur Herfindahl-Hirschman Index
  const hhi = exposure.reduce((sum, e) => sum + Math.pow(e.weight / 100, 2), 0);
  // hhi = 1 = 1 seule position ; hhi = 0 = parfaitement diversifié
  const baseScore = (1 - hhi) * 10;

  // Bonus selon le nombre de positions
  const countBonus = Math.min(nbPositions / 10, 1) * 2;

  return Math.round(Math.min(10, baseScore + countBonus));
}
