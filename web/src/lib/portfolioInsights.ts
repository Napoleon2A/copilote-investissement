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
  positions: Array<{ ticker: string; market_value?: number; pnl_pct?: number; change_1d?: number; change_1m?: number; change_ytd?: number; pct_from_52w_high?: number; sector?: string }>;
  totalValue?: number;
  ideas: Array<{ ticker: string; conviction?: string; action?: string }>;
  picks: Array<{ ticker: string; sector_group?: string; scores?: any; action_label?: string; change_1d?: number; change_1m?: number }>;
  upcomingEarnings: Array<{ ticker: string; days_until: number; name?: string; change_1d?: number; change_1m?: number; scores?: any }>;
  linkedNews: Array<{ title: string; ticker?: string; tickers_mentioned?: string[]; category: string }>;
  /** Rotation sectorielle issue de brief.market_context */
  sectorRotation?: {
    leaders?: Array<{ sector: string; change_1m: number }>;
    laggards?: Array<{ sector: string; change_1m: number }>;
  };
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

  // ── PERFORMANCE INDIVIDUELLE DES POSITIONS (faits + comparaisons) ───
  const sp500Ytd = snapshot.sp500_ytd ?? 0;
  for (const p of positions) {
    const meta = TICKER_META[p.ticker.toUpperCase()];
    const name = meta?.name ?? p.ticker;

    if (p.pnl_pct != null && p.pnl_pct > 50) {
      const vsSp = p.pnl_pct - sp500Ytd;
      const drawdownInfo = p.pct_from_52w_high != null
        ? ` Actuellement à ${p.pct_from_52w_high >= 0 ? "+" : ""}${p.pct_from_52w_high.toFixed(0)}% du plus haut 52w.`
        : "";
      const dailyMove = p.change_1d != null
        ? ` Aujourd'hui ${p.change_1d >= 0 ? "+" : ""}${p.change_1d.toFixed(2)}%.`
        : "";
      insights.push({
        category: "sensitivity",
        tone: "good",
        title: `${p.ticker} : +${p.pnl_pct.toFixed(0)}% (vs S&P 500 +${sp500Ytd.toFixed(1)}% YTD = ${vsSp >= 0 ? "+" : ""}${vsSp.toFixed(0)} pt d'écart)`,
        detail: `${name} surperforme le S&P de ${vsSp.toFixed(0)} points.${drawdownInfo}${dailyMove}`,
        tickers: [p.ticker],
      });
    } else if (p.pnl_pct != null && p.pnl_pct < -20) {
      const vsSp = p.pnl_pct - sp500Ytd;
      insights.push({
        category: "sensitivity",
        tone: "warning",
        title: `${p.ticker} : ${p.pnl_pct.toFixed(0)}% (vs S&P 500 +${sp500Ytd.toFixed(1)}% YTD = ${vsSp.toFixed(0)} pt d'écart)`,
        detail: `${name} sous-performe le S&P de ${Math.abs(vsSp).toFixed(0)} points. ${p.pct_from_52w_high != null ? `À ${p.pct_from_52w_high.toFixed(0)}% du plus haut 52w. ` : ""}${p.change_1d != null ? `Aujourd'hui ${p.change_1d >= 0 ? "+" : ""}${p.change_1d.toFixed(2)}%.` : ""}`,
        tickers: [p.ticker],
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

    const score = e.scores?.composite;
    const scoreInfo = score != null ? ` Score scanner ${score.toFixed(1)}/10.` : "";
    const moveInfo = e.change_1d != null ? ` Aujourd'hui ${e.change_1d >= 0 ? "+" : ""}${e.change_1d.toFixed(2)}%.` : "";

    if (e.days_until === 0) {
      insights.push({
        category: "earnings",
        tone: "warning",
        title: `📊 ${e.ticker} publie aujourd'hui (${source})`,
        detail: `${e.name ?? e.ticker}.${scoreInfo}${moveInfo}`,
        tickers: [e.ticker],
      });
    } else if (e.days_until <= 7) {
      insights.push({
        category: "earnings",
        tone: "info",
        title: `📊 ${e.ticker} publie dans ${e.days_until}j (${source})`,
        detail: `${e.name ?? e.ticker}.${scoreInfo}${moveInfo}`,
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
    const sample = criticalNews.slice(0, 2).map(c => `${c.ticker} : "${c.title.slice(0, 80)}${c.title.length > 80 ? "…" : ""}"`).join(" · ");
    insights.push({
      category: "news",
      tone: "warning",
      title: `${criticalNews.length} actualité${criticalNews.length > 1 ? "s" : ""} négative${criticalNews.length > 1 ? "s" : ""} sur ${uniqTickers.join(", ")}`,
      detail: sample,
      tickers: uniqTickers,
    });
  }

  // ── 5. OPPORTUNITÉS MANQUÉES ──────────────────────────────────────────
  const myPickedTickers = new Set([...myTickers, ...picks.map(p => p.ticker.toUpperCase())]);
  const sectorsInPortfolio = new Set(exposureBySector.map(e => e.sector));

  for (const pick of picks.slice(0, 3)) {
    const meta = TICKER_META[pick.ticker.toUpperCase()];
    if (!meta?.sector) continue;
    if (!myTickers.has(pick.ticker.toUpperCase())) {
      const score = pick.scores?.composite;
      const move = pick.change_1d != null ? ` Aujourd'hui ${pick.change_1d >= 0 ? "+" : ""}${pick.change_1d.toFixed(2)}%.` : "";
      const move1m = pick.change_1m != null ? ` Sur 1M : ${pick.change_1m >= 0 ? "+" : ""}${pick.change_1m.toFixed(1)}%.` : "";
      insights.push({
        category: "missed",
        tone: "info",
        title: `${pick.ticker} (${SECTOR_LABELS[meta.sector] ?? meta.sector}) : score ${score?.toFixed(1) ?? "?"}/10`,
        detail: `${meta.name}, action « ${pick.action_label} ».${move}${move1m}`,
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

  // ── PERFORMANCE VS SECTEUR (sur/sous-performance) ────────────────────
  if (input.sectorRotation && positions.length > 0) {
    const allSectors = [
      ...(input.sectorRotation.leaders ?? []),
      ...(input.sectorRotation.laggards ?? []),
    ];

    for (const p of positions) {
      const meta = TICKER_META[p.ticker.toUpperCase()];
      if (!meta?.sector || p.change_1m == null) continue;

      // Trouver la performance moyenne du secteur
      const sectorMatch = allSectors.find(s =>
        s.sector.toLowerCase().includes(SECTOR_LABELS[meta.sector!]?.toLowerCase() ?? "")
        || SECTOR_LABELS[meta.sector!]?.toLowerCase().includes(s.sector.toLowerCase())
      );

      if (sectorMatch) {
        const delta = p.change_1m - sectorMatch.change_1m;
        if (Math.abs(delta) > 5) {
          const isOver = delta > 0;
          insights.push({
            category: "sensitivity",
            tone: isOver ? "good" : "warning",
            title: `${p.ticker} : ${isOver ? "sur" : "sous"}-performance vs ${sectorMatch.sector}`,
            detail: `${meta.name} : ${p.change_1m >= 0 ? "+" : ""}${p.change_1m.toFixed(1)}% sur 1M, vs secteur ${sectorMatch.sector} à ${sectorMatch.change_1m >= 0 ? "+" : ""}${sectorMatch.change_1m.toFixed(1)}%. ${isOver ? "Surperforme" : "Sous-performe"} de ${Math.abs(delta).toFixed(1)} pt. ${isOver ? "Catalyseur propre à la société (good news, beat earnings, etc.). Vérifier la durabilité." : "Soit retard de phase rattrapable, soit problème spécifique (concurrence, exécution, news négatives). À investiguer."}`,
            tickers: [p.ticker],
          });
        }
      }
    }
  }

  // ── DYNAMIQUE DES SECTEURS DES POSITIONS ─────────────────────────────
  if (input.sectorRotation && positions.length > 0) {
    const myPortfolioSectors = new Set(
      positions.map(p => TICKER_META[p.ticker.toUpperCase()]?.sector).filter(Boolean) as SectorKey[]
    );

    // Si un secteur du portefeuille est en tête des leaders
    const topLeader = input.sectorRotation.leaders?.[0];
    if (topLeader && topLeader.change_1m > 5) {
      // Vérifier si le secteur leader est dans le portefeuille
      const isInPortfolio = Array.from(myPortfolioSectors).some(s =>
        SECTOR_LABELS[s]?.toLowerCase().includes(topLeader.sector.toLowerCase())
        || topLeader.sector.toLowerCase().includes(SECTOR_LABELS[s]?.toLowerCase() ?? "")
      );

      if (isInPortfolio) {
        const matchingTickers = positions
          .filter(p => {
            const sec = TICKER_META[p.ticker.toUpperCase()]?.sector;
            return sec && (
              SECTOR_LABELS[sec]?.toLowerCase().includes(topLeader.sector.toLowerCase())
              || topLeader.sector.toLowerCase().includes(SECTOR_LABELS[sec]?.toLowerCase() ?? "")
            );
          })
          .map(p => p.ticker);
        const sp500_1m = snapshot.sp500_1m ?? 0;
        const overSP = topLeader.change_1m - sp500_1m;
        insights.push({
          category: "sensitivity",
          tone: "good",
          title: `${topLeader.sector} +${topLeader.change_1m.toFixed(1)}% 1M (vs S&P +${sp500_1m.toFixed(1)}% = ${overSP >= 0 ? "+" : ""}${overSP.toFixed(1)} pt)`,
          detail: `Tes positions ${matchingTickers.join(", ")} sont dans le secteur le plus performant du mois. Le secteur surperforme le S&P de ${overSP.toFixed(1)} points sur 1 mois.`,
          tickers: matchingTickers,
        });
      }
    }

    // Secteur du portefeuille en queue des laggards
    const topLaggard = input.sectorRotation.laggards?.[0];
    if (topLaggard && topLaggard.change_1m < -3) {
      const isInPortfolio = Array.from(myPortfolioSectors).some(s =>
        SECTOR_LABELS[s]?.toLowerCase().includes(topLaggard.sector.toLowerCase())
        || topLaggard.sector.toLowerCase().includes(SECTOR_LABELS[s]?.toLowerCase() ?? "")
      );

      if (isInPortfolio) {
        const matchingTickers = positions
          .filter(p => {
            const sec = TICKER_META[p.ticker.toUpperCase()]?.sector;
            return sec && (
              SECTOR_LABELS[sec]?.toLowerCase().includes(topLaggard.sector.toLowerCase())
              || topLaggard.sector.toLowerCase().includes(SECTOR_LABELS[sec]?.toLowerCase() ?? "")
            );
          })
          .map(p => p.ticker);
        const sp500_1m = snapshot.sp500_1m ?? 0;
        const underSP = topLaggard.change_1m - sp500_1m;
        insights.push({
          category: "sensitivity",
          tone: "warning",
          title: `${topLaggard.sector} ${topLaggard.change_1m.toFixed(1)}% 1M (vs S&P +${sp500_1m.toFixed(1)}% = ${underSP.toFixed(1)} pt)`,
          detail: `Tes positions ${matchingTickers.join(", ")} sont dans le secteur le moins performant du mois. Le secteur sous-performe le S&P de ${Math.abs(underSP).toFixed(1)} points sur 1 mois.`,
          tickers: matchingTickers,
        });
      }
    }
  }

  // ── EARNINGS À HAUT POTENTIEL DANS L'UNIVERS DES IDÉES ───────────────
  // Identifier des earnings à venir avec des scores élevés sur des tickers que l'utilisateur suit
  for (const e of upcomingEarnings) {
    const isMine = positions.some(p => p.ticker.toUpperCase() === e.ticker.toUpperCase())
                || ideas.some(i => i.ticker.toUpperCase() === e.ticker.toUpperCase());
    if (!isMine) continue;
    const score = e.scores?.composite;
    if (score != null && score >= 7.5 && e.days_until > 0 && e.days_until <= 14) {
      const meta = TICKER_META[e.ticker.toUpperCase()];
      const move1m = e.change_1m != null ? ` 1M : ${e.change_1m >= 0 ? "+" : ""}${e.change_1m.toFixed(1)}%.` : "";
      insights.push({
        category: "sensitivity",
        tone: "good",
        title: `${e.ticker} : score ${score.toFixed(1)}/10 + earnings J-${e.days_until}`,
        detail: `${meta?.name ?? e.ticker}.${move1m}`,
        tickers: [e.ticker],
      });
    }
  }

  // ── SCORE QUALITATIF DU PORTEFEUILLE (basé sur perf des positions) ───
  const scoreBreakdown = computeQualityScore(positions, input.sectorRotation);
  const diversificationScore = Math.round(
    (scoreBreakdown.sector * 0.40 +
     scoreBreakdown.geo * 0.20 +
     scoreBreakdown.positionMax * 0.20 +
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
 * Score qualitatif du portefeuille — 4 dimensions société/secteur (pas portfolio mgmt).
 *
 * Au lieu de regarder la diversification (HHI, géo, etc.), on regarde :
 * - performance : combien de positions sont en gain
 * - momentum_sector : combien de tes secteurs sont leaders du marché
 * - catalysts : earnings imminents avec scores élevés
 * - relative_strength : sociétés en sur-performance vs leur secteur
 */
function computeQualityScore(
  positions: Array<{ ticker: string; pnl_pct?: number; change_1m?: number }>,
  sectorRotation?: { leaders?: Array<{ sector: string; change_1m: number }>; laggards?: Array<{ sector: string; change_1m: number }> },
): { sector: number; geo: number; positionMax: number; trends: number } {
  if (positions.length === 0) return { sector: 0, geo: 0, positionMax: 0, trends: 0 };

  // Renommage interne : on garde les 4 clés pour ne pas casser l'interface.
  // sector → momentum sectoriel (combien de tes secteurs sont leaders)
  // geo → performance (combien de positions en gain)
  // positionMax → relative strength (combien sur-performent leur secteur)
  // trends → cycle (sur-perf moyenne 1M)

  // 1. PERFORMANCE (positions en gain)
  const inGain = positions.filter(p => (p.pnl_pct ?? 0) > 0).length;
  const performanceScore = Math.round((inGain / positions.length) * 10);

  // 2. MOMENTUM SECTORIEL (combien de tes secteurs sont leaders)
  let sectorMomentumScore = 5; // neutre par défaut
  if (sectorRotation?.leaders && sectorRotation.leaders.length > 0) {
    const leaderSectors = sectorRotation.leaders.map(l => l.sector.toLowerCase());
    const positionSectors = positions
      .map(p => TICKER_META[p.ticker.toUpperCase()]?.sector)
      .filter(Boolean)
      .map(s => SECTOR_LABELS[s as SectorKey]?.toLowerCase() ?? "");
    const inLeaders = positionSectors.filter(ps =>
      leaderSectors.some(ls => ls.includes(ps) || ps.includes(ls))
    ).length;
    sectorMomentumScore = Math.min(10, Math.round(5 + (inLeaders / positions.length) * 5));
  }

  // 3. RELATIVE STRENGTH (positions en sur-performance vs leur secteur)
  let relativeStrengthScore = 5;
  if (sectorRotation && positions.length > 0) {
    let outperforming = 0;
    let counted = 0;
    const allSectors = [...(sectorRotation.leaders ?? []), ...(sectorRotation.laggards ?? [])];
    for (const p of positions) {
      if (p.change_1m == null) continue;
      const meta = TICKER_META[p.ticker.toUpperCase()];
      if (!meta?.sector) continue;
      const sectorLabel = SECTOR_LABELS[meta.sector]?.toLowerCase() ?? "";
      const sectorMatch = allSectors.find(s =>
        s.sector.toLowerCase().includes(sectorLabel) || sectorLabel.includes(s.sector.toLowerCase())
      );
      if (sectorMatch) {
        counted++;
        if (p.change_1m > sectorMatch.change_1m) outperforming++;
      }
    }
    if (counted > 0) relativeStrengthScore = Math.round((outperforming / counted) * 10);
  }

  // 4. CYCLE (perf moyenne 1M des positions)
  const change1mValues = positions.map(p => p.change_1m).filter((v): v is number => v != null);
  let cycleScore = 5;
  if (change1mValues.length > 0) {
    const avg1m = change1mValues.reduce((a, b) => a + b, 0) / change1mValues.length;
    if (avg1m > 5) cycleScore = 10;
    else if (avg1m > 2) cycleScore = 8;
    else if (avg1m > 0) cycleScore = 6;
    else if (avg1m > -2) cycleScore = 4;
    else if (avg1m > -5) cycleScore = 2;
    else cycleScore = 1;
  }

  return {
    sector: sectorMomentumScore,        // momentum sectoriel
    geo: performanceScore,              // performance des positions
    positionMax: relativeStrengthScore, // sur-performance vs secteur
    trends: cycleScore,                 // cycle (perf 1M)
  };
}
