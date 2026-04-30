"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TickerBadge } from "@/components/ui/TickerBadge";
import { Sparkline } from "@/components/ui/Sparkline";
import { getTickerMeta, SECTOR_COLORS, SECTOR_LABEL } from "@/lib/tickerMeta";
import {
  explainVix, explainRegime, explainSectorRotation,
  explainIndex, explainTreasury10Y, explainDollar, explainOil, explainGold,
  buildMarketReasoning, getNewsImpact,
} from "@/lib/macroExplainer";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default function HomePage() {
  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const [brief, setBrief]         = useState<any>(undefined);
  const [opps, setOpps]           = useState<any>(undefined);
  const [earnings, setEarnings]   = useState<any>(undefined);
  const [alerts, setAlerts]       = useState<any>(undefined);
  const [watchlists, setWatchlists] = useState<any>(undefined);
  const [portfolio, setPortfolio] = useState<any>(undefined);
  const [ideas, setIdeas]         = useState<any>(undefined);
  const [macroNewsRSS, setMacroNewsRSS] = useState<any>(undefined);
  const [linkedNewsRSS, setLinkedNewsRSS] = useState<any>(undefined);
  const [perTickerNews, setPerTickerNews] = useState<any>(undefined);

  useEffect(() => {
    fetchJSON<any>(`${API}/brief`).then(setBrief);
    fetchJSON<any>(`${API}/scanner/opportunities?max_results=5`).then(setOpps);
    fetchJSON<any>(`${API}/earnings/upcoming`).then(setEarnings);
    fetchJSON<any>(`${API}/alerts`).then(setAlerts);
    fetchJSON<any[]>(`${API}/watchlists`).then(setWatchlists);
    fetchJSON<any>(`${API}/portfolio/positions`).then(setPortfolio);
    fetchJSON<any[]>(`${API}/ideas`).then(setIdeas);
    fetchJSON<any>(`${API}/news/macro?limit=20`).then(setMacroNewsRSS);
  }, []);

  // Quand on a portefeuille + idées + opps, on charge les news liées
  useEffect(() => {
    if (portfolio === undefined || ideas === undefined || opps === undefined) return;
    const tickers = new Set<string>();
    portfolio?.positions?.forEach((p: any) => tickers.add(p.ticker?.toUpperCase()));
    ideas?.forEach((i: any) => tickers.add(i.ticker?.toUpperCase()));
    opps?.opportunities?.slice(0, 3).forEach((p: any) => tickers.add(p.ticker?.toUpperCase()));
    const list = Array.from(tickers).filter(Boolean).join(",");
    if (list) {
      fetchJSON<any>(`${API}/news/linked?tickers=${list}&limit=20`).then(setLinkedNewsRSS);
      fetchJSON<any>(`${API}/news/per-ticker?tickers=${list}&max_per_ticker=5`).then(setPerTickerNews);
    } else {
      setLinkedNewsRSS({ count: 0, articles: [] });
      setPerTickerNews({ count: 0, articles: [] });
    }
  }, [portfolio, ideas, opps]);

  const topPicks = opps?.opportunities?.slice(0, 3) ?? [];

  const myTickers = useMemo(() => {
    const set = new Set<string>();
    portfolio?.positions?.forEach((p: any) => set.add(p.ticker?.toUpperCase()));
    ideas?.forEach((i: any) => set.add(i.ticker?.toUpperCase()));
    topPicks.forEach((p: any) => set.add(p.ticker?.toUpperCase()));
    return set;
  }, [portfolio, ideas, topPicks]);

  return (
    <div className="space-y-6 pb-6">

      {/* ── Header : ciel nocturne + Lune centrée + médaillon Napoléon */}
      <div className="relative h-[160px] sm:h-[180px] rounded-2xl overflow-hidden shadow-md"
        style={{
          background:
            "radial-gradient(ellipse at center, rgb(22, 38, 62) 0%, rgb(11, 25, 41) 70%, rgb(8, 18, 30) 100%)",
        }}>

        {/* Lune au centre — HD avec halo lunaire */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          {/* Halo lunaire externe (très diffus) */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] sm:w-[340px] sm:h-[340px] rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(220,225,240,0.18) 0%, rgba(220,225,240,0.05) 45%, transparent 70%)",
              filter: "blur(8px)",
            }}
          />
          {/* Halo proche (plus défini) */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[170px] h-[170px] sm:w-[200px] sm:h-[200px] rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(210,220,235,0.25) 0%, transparent 60%)",
              filter: "blur(4px)",
            }}
          />
          {/* La Lune en HD — wrapper pour zoom intérieur (exclure marges noires de la photo) */}
          <div
            className="relative w-[120px] h-[120px] sm:w-[140px] sm:h-[140px] rounded-full overflow-hidden"
            style={{
              boxShadow: "0 0 60px rgba(210,220,235,0.45), 0 0 30px rgba(210,220,235,0.3)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/lune.jpg"
              alt="Pleine lune"
              className="w-full h-full object-cover"
              style={{
                transform: "scale(1.12)",  // zoom pour cropper les bords sombres
                filter: "brightness(1.1) contrast(1.05)",
              }}
            />
          </div>
        </div>

        {/* Étoiles SVG en background (10 petits points blancs) */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
          <g fill="white">
            <circle cx="8%"  cy="20%" r="0.7" opacity="0.6" />
            <circle cx="15%" cy="55%" r="0.5" opacity="0.4" />
            <circle cx="22%" cy="80%" r="0.6" opacity="0.5" />
            <circle cx="30%" cy="30%" r="0.4" opacity="0.7" />
            <circle cx="42%" cy="15%" r="0.5" opacity="0.5" />
            <circle cx="65%" cy="85%" r="0.6" opacity="0.5" />
            <circle cx="75%" cy="22%" r="0.5" opacity="0.6" />
            <circle cx="82%" cy="60%" r="0.4" opacity="0.4" />
            <circle cx="90%" cy="35%" r="0.6" opacity="0.55" />
            <circle cx="55%" cy="92%" r="0.5" opacity="0.5" />
          </g>
        </svg>

        {/* Texture grain ultra subtile */}
        <div
          className="absolute inset-0 opacity-[0.06] mix-blend-overlay pointer-events-none"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />

        {/* Liseré accent bas (touche éditoriale) */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px]"
          style={{ background: "linear-gradient(90deg, transparent 0%, rgb(var(--accent)) 30%, rgb(var(--accent)) 70%, transparent 100%)" }}
        />

        {/* Contenu */}
        <div className="relative h-full flex items-center justify-between px-6 sm:px-10">
          {/* Bloc gauche : titre + date */}
          <div className="flex items-center gap-5">
            <div className="flex flex-col gap-1.5">
              <div className="w-12 h-[2px] bg-accent" />
              <span className="text-accent text-[0.625rem] tracking-[0.35em] uppercase font-semibold">
                Est. mmxxiii
              </span>
            </div>
            <div>
              <h1
                className="text-white text-2xl sm:text-3xl font-bold tracking-[0.02em] leading-tight"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Tableau de bord
              </h1>
              <p className="text-white/70 text-xs sm:text-sm capitalize mt-1 tracking-wide">
                {today}
              </p>
            </div>
          </div>

          {/* Bloc droit : médaillon impérial doré + marque Austerlitz */}
          <div className="flex items-center gap-4">
            {/* Marque (avant le médaillon) */}
            <div className="hidden sm:block text-right">
              <p
                className="text-white text-base sm:text-lg font-bold tracking-[0.18em] uppercase leading-none"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Austerlitz
              </p>
              <p className="text-accent text-[0.7rem] tracking-[0.3em] uppercase font-medium mt-1.5">
                Hedge Fund
              </p>
              <p className="text-white/40 text-[0.625rem] tracking-wider italic mt-1">
                Audace · Méthode · Patience
              </p>
            </div>

            {/* Médaillon — couronne de laurier en accent (sceau sobre) */}
            <div className="relative flex-shrink-0">
              {/* Halo accent derrière le médaillon */}
              <div className="absolute inset-0 rounded-full"
                style={{
                  background: "radial-gradient(circle, rgba(94,150,176,0.45) 0%, transparent 70%)",
                  transform: "scale(1.5)",
                }}
              />
              {/* Bordure simple en accent */}
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full p-[2px]"
                style={{
                  background: "linear-gradient(135deg, rgb(var(--accent)) 0%, rgba(var(--accent), 0.4) 50%, rgb(var(--accent)) 100%)",
                  boxShadow: "0 2px 10px rgba(11,25,41,0.4), inset 0 1px 1px rgba(255,255,255,0.15)",
                }}
              >
                {/* Cercle intérieur — portrait de Napoléon */}
                <div className="w-full h-full rounded-full overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/napoleon.jpg"
                    alt="Bonaparte franchissant le Grand-Saint-Bernard — Jacques-Louis David"
                    className="w-full h-full object-cover"
                    style={{ objectPosition: "50% 18%" }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Crédit tableau */}
        <p className="absolute bottom-1.5 right-3 text-white/25 text-[0.55rem] tracking-wide">
          David, 1801 · Domaine public
        </p>
      </div>

      {/* ── Picks du jour COMPACTS (3 cards horizontales) ────────────────── */}
      <CompactPicksRow picks={topPicks} loading={opps === undefined} scanning={opps?.scanning} />

      {/* ── ROW 1 : Comprendre marché ↔ Actualité des cibles (hauteur réduite ~450px) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:h-[480px]">
        <div className="lg:col-span-3 min-h-0">
          <MarketContextPanel ctx={brief?.market_context} marketSummary={brief?.market_summary} loading={brief === undefined} />
        </div>
        <div className="lg:col-span-2 min-h-0">
          <LinkedNewsPanelRSS
            data={linkedNewsRSS}
            perTickerData={perTickerNews}
            portfolioTickers={new Set(portfolio?.positions?.map((p: any) => p.ticker?.toUpperCase()) ?? [])}
            ideasTickers={new Set(ideas?.map((i: any) => i.ticker?.toUpperCase()) ?? [])}
            picksTickers={new Set(topPicks.map((p: any) => p.ticker?.toUpperCase()))}
          />
        </div>
      </div>

      {/* ── ROW 2 : Actualité macro ↔ Grille 2x2 (hauteur fixe pour éviter l'étirement) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:h-[460px]">
        <div className="lg:col-span-3 min-h-0">
          <MacroNewsPanelRSS data={macroNewsRSS} />
        </div>
        <div className="lg:col-span-2 min-h-0">
          <div className="grid grid-cols-2 gap-3 h-full" style={{ gridAutoRows: "1fr" }}>
            <RichEarningsCard earnings={earnings} />
            <RichPortfolioCard portfolio={portfolio} />
            <RichWatchlistCard watchlists={watchlists} />
            <RichAlertsCard alerts={alerts} />
          </div>
        </div>
      </div>

    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * PICKS COMPACTS — 3 cards horizontales très denses
 * ════════════════════════════════════════════════════════════════════════ */

function CompactPicksRow({ picks, loading, scanning }: { picks: any[]; loading: boolean; scanning?: boolean }) {
  if (loading || scanning) {
    return (
      <div>
        <SectionTitle title="Picks du jour" subtitle={scanning ? "Scan en cours · ~60s" : "Chargement..."} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => <div key={i} className="rounded-xl border border-edge bg-surface h-24 animate-pulse" />)}
        </div>
      </div>
    );
  }
  if (!picks?.length) return null;

  return (
    <div>
      <SectionTitle title="Picks du jour" subtitle={`Top ${picks.length} opportunités sélectionnées par le scanner`} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {picks.map((p, i) => <CompactPick key={p.ticker} pick={p} rank={i + 1} />)}
      </div>
    </div>
  );
}

function CompactPick({ pick, rank }: { pick: any; rank: number }) {
  const meta = getTickerMeta(pick.ticker);
  const sector = meta.sector;
  const sectorStyle = sector ? SECTOR_COLORS[sector] : null;
  const change = pick.change_1d;
  const isUp = (change ?? 0) >= 0;

  return (
    <Link href={`/company/${pick.ticker}`} className="block group">
      <div className="card-premium card-aura relative px-5 py-4 overflow-hidden h-full">
        <div className="flex items-center gap-3 relative">

          {/* Logo + nom */}
          <TickerBadge ticker={pick.ticker} size="md" showName={false} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[0.625rem] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">#{rank}</span>
              {sectorStyle && sector && (
                <span className={`text-[0.55rem] font-semibold uppercase tracking-wider px-1 py-px rounded border ${sectorStyle.bg} ${sectorStyle.text} ${sectorStyle.border}`}>
                  {SECTOR_LABEL[sector]}
                </span>
              )}
              {pick.new_opportunity && (
                <span className="text-[0.55rem] font-semibold uppercase tracking-wider px-1 py-px rounded
                                 bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                  Nouv.
                </span>
              )}
            </div>
            <h3 className="text-sm font-bold text-primary leading-tight truncate"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {meta.name}
            </h3>
            <p className="text-[0.7rem] text-muted font-mono">{pick.ticker} · {pick.action_label}</p>
          </div>

          {/* Score + sparkline + change */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <div className="flex items-center gap-2">
              {pick.scores?.composite != null && <ScoreGauge value={pick.scores.composite} size={36} />}
              <Sparkline ticker={pick.ticker} width={50} height={20} />
            </div>
            <span className={`text-xs font-mono font-bold ${isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {isUp ? "+" : ""}{change?.toFixed(2)}%
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * MARKET CONTEXT — Vulgarisation pédagogique du régime + VIX
 * ════════════════════════════════════════════════════════════════════════ */

function MarketContextPanel({ ctx, marketSummary, loading }: { ctx: any; marketSummary: any; loading: boolean }) {
  if (loading) {
    return <div className="rounded-2xl border border-edge bg-surface h-96 animate-pulse" />;
  }
  if (!ctx) return null;

  const ms = marketSummary ?? {};
  const sp500 = ms.SP500;
  const nasdaq = ms.NASDAQ;
  const cac40 = ms.CAC40;
  const us10y = ms.US10Y;
  const dxy = ms.DXY;
  const gold = ms.Or;
  const wti = ms.WTI;

  // Synthèse argumentaire
  const reasoning = buildMarketReasoning(
    ctx.vix,
    sp500?.change_ytd ?? null,
    sp500?.change_1m ?? null,
    us10y?.price ?? null,
    dxy?.change_1m ?? null,
    wti?.change_ytd ?? null,
    gold?.change_ytd ?? null,
  );

  const regimeExp = explainRegime(ctx.regime, ctx.regime_label);
  const vixExp = explainVix(ctx.vix);
  const rotationExp = explainSectorRotation(ctx.sector_rotation?.leaders, ctx.sector_rotation?.laggards);

  const TONE_BG: Record<string, string> = {
    positive: "from-emerald-500/10",
    negative: "from-red-500/10",
    neutral:  "from-blue-500/10",
    warning:  "from-amber-500/10",
  };
  const TONE_DOT: Record<string, string> = {
    positive: "bg-emerald-500",
    negative: "bg-red-500",
    neutral:  "bg-blue-500",
    warning:  "bg-amber-500",
  };

  return (
    <div className="card-premium card-aura relative p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base">🌍</span>
          <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-secondary"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Comprendre le marché aujourd&apos;hui
          </h4>
        </div>
        <Link href="/brief" className="text-[0.7rem] text-muted hover:text-navy dark:hover:text-accent transition-colors flex items-center gap-1">
          Détail <span>→</span>
        </Link>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-2 nice-scroll">

      {/* Synthèse "pourquoi" en haut */}
      <div className="rounded-xl border border-edge/50 bg-surface/60 backdrop-blur-sm p-3 mb-4">
        <p className="text-[0.7rem] font-bold uppercase tracking-widest text-muted mb-2">📊 Pourquoi ce diagnostic ?</p>
        <div className="space-y-1">
          {reasoning.positive.length > 0 && reasoning.positive.map((s, i) => (
            <div key={`p${i}`} className="flex items-start gap-2 text-xs text-secondary">
              <span className="text-emerald-600 dark:text-emerald-400 flex-shrink-0">✓</span>
              <span className="leading-snug">{s}</span>
            </div>
          ))}
          {reasoning.negative.length > 0 && reasoning.negative.map((s, i) => (
            <div key={`n${i}`} className="flex items-start gap-2 text-xs text-secondary">
              <span className="text-red-600 dark:text-red-400 flex-shrink-0">⚠</span>
              <span className="leading-snug">{s}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-primary mt-2 pt-2 border-t border-edge/40 font-medium leading-relaxed">
          → {reasoning.conclusion}
        </p>
      </div>

      {/* Régime de marché — explication */}
      <ExplainBlock dotColor={TONE_DOT[regimeExp.tone]} headline={regimeExp.headline} detail={regimeExp.detail} />

      {/* VIX — explication */}
      {vixExp && (
        <div className="mt-3 pt-3 border-t border-edge/40">
          <ExplainBlock dotColor={TONE_DOT[vixExp.tone]} headline={vixExp.headline} detail={vixExp.detail} />
        </div>
      )}

      {/* Indices boursiers */}
      {sp500 && (
        <div className="mt-3 pt-3 border-t border-edge/40">
          <p className="text-[0.7rem] font-bold uppercase tracking-widest text-muted mb-2">📈 Indices boursiers</p>
          <div className="space-y-2">
            <IndicatorBlock
              name="S&P 500" exp={explainIndex("Le S&P 500", sp500.change_ytd, sp500.change_1m)}
              detail={`${sp500.price?.toFixed(0)} pts · ${formatChange(sp500.change_1d)}j · ${formatChange(sp500.change_1m)} 1M · ${formatChange(sp500.change_ytd)} YTD`}
            />
            {nasdaq && (
              <IndicatorBlock
                name="NASDAQ" exp={explainIndex("Le NASDAQ (tech US)", nasdaq.change_ytd, nasdaq.change_1m)}
                detail={`${nasdaq.price?.toFixed(0)} pts · ${formatChange(nasdaq.change_1d)}j · ${formatChange(nasdaq.change_1m)} 1M · ${formatChange(nasdaq.change_ytd)} YTD`}
              />
            )}
            {cac40 && (
              <IndicatorBlock
                name="CAC 40" exp={explainIndex("Le CAC 40 (Paris)", cac40.change_ytd, cac40.change_1m)}
                detail={`${cac40.price?.toFixed(0)} pts · ${formatChange(cac40.change_1d)}j · ${formatChange(cac40.change_1m)} 1M · ${formatChange(cac40.change_ytd)} YTD`}
              />
            )}
          </div>
        </div>
      )}

      {/* Taux 10 ans */}
      {us10y && (
        <div className="mt-3 pt-3 border-t border-edge/40">
          <p className="text-[0.7rem] font-bold uppercase tracking-widest text-muted mb-2">💵 Taux d&apos;intérêt</p>
          <IndicatorBlock
            name="US 10Y" exp={explainTreasury10Y(us10y.price, us10y.change_ytd)}
            detail={`Rendement actuel : ${us10y.price?.toFixed(2)}%`}
          />
        </div>
      )}

      {/* Dollar / Or / Pétrole */}
      {(dxy || gold || wti) && (
        <div className="mt-3 pt-3 border-t border-edge/40">
          <p className="text-[0.7rem] font-bold uppercase tracking-widest text-muted mb-2">🌐 Devises & matières premières</p>
          <div className="space-y-2">
            {dxy && <IndicatorBlock name="Dollar" exp={explainDollar(dxy.price, dxy.change_1m)} />}
            {gold && <IndicatorBlock name="Or" exp={explainGold(gold.price, gold.change_ytd)} />}
            {wti && <IndicatorBlock name="Pétrole" exp={explainOil(wti.price, wti.change_ytd)} />}
          </div>
        </div>
      )}

      {/* Rotation sectorielle */}
      {rotationExp && (
        <div className="mt-3 pt-3 border-t border-edge/40">
          <p className="text-[0.7rem] font-bold uppercase tracking-widest text-muted mb-1.5">↻ Rotation sectorielle</p>
          <p className="text-xs text-secondary leading-relaxed">{rotationExp}</p>
          {ctx.sector_rotation?.leaders?.length > 0 && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <p className="text-[0.625rem] font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 mb-1">↑ Sur-performance</p>
                <ul className="space-y-0.5">
                  {ctx.sector_rotation.leaders.slice(0, 5).map((s: any, i: number) => (
                    <li key={i} className="flex items-center justify-between text-xs">
                      <span className="text-secondary truncate">{s.sector}</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                        {s.change_1m > 0 ? "+" : ""}{s.change_1m.toFixed(1)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              {ctx.sector_rotation.laggards?.length > 0 && (
                <div>
                  <p className="text-[0.625rem] font-semibold uppercase tracking-widest text-red-700 dark:text-red-400 mb-1">↓ Sous-performance</p>
                  <ul className="space-y-0.5">
                    {ctx.sector_rotation.laggards.slice(0, 5).map((s: any, i: number) => (
                      <li key={i} className="flex items-center justify-between text-xs">
                        <span className="text-secondary truncate">{s.sector}</span>
                        <span className="font-mono text-red-600 dark:text-red-400 font-medium">
                          {s.change_1m > 0 ? "+" : ""}{s.change_1m.toFixed(1)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function ExplainBlock({ dotColor, headline, detail }: { dotColor: string; headline: string; detail: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-2 h-2 rounded-full ${dotColor} animate-pulse`} />
        <h5 className="text-sm font-semibold text-primary"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {headline}
        </h5>
      </div>
      <p className="text-xs text-secondary leading-relaxed pl-4">{detail}</p>
    </div>
  );
}

const TONE_DOT_COLORS: Record<string, string> = {
  positive: "bg-emerald-500",
  negative: "bg-red-500",
  neutral:  "bg-blue-500",
  warning:  "bg-amber-500",
};

function IndicatorBlock({ name, exp, detail }: { name: string; exp: any; detail?: string }) {
  return (
    <div className="rounded-lg bg-surface/40 p-2.5 border border-edge/30">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT_COLORS[exp.tone] ?? "bg-muted"}`} />
        <span className="text-xs font-bold text-secondary uppercase tracking-wider">{name}</span>
        <span className="text-xs font-medium text-primary ml-auto">{exp.label}</span>
      </div>
      {detail && <p className="text-[0.7rem] font-mono text-muted mb-1 pl-3">{detail}</p>}
      <p className="text-xs text-secondary leading-relaxed pl-3">{exp.detail}</p>
    </div>
  );
}

function formatChange(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

/* ════════════════════════════════════════════════════════════════════════
 * MACRO NEWS — Actualité générale qui impacte les marchés
 * ════════════════════════════════════════════════════════════════════════ */

/* ── Nouveau panneau Macro RSS avec scroll ─────────────────────────────── */
const RSS_CATEGORY_LABELS: Record<string, { label: string; icon: string; bg: string; text: string; border: string }> = {
  macro:        { label: "Macro",         icon: "🏦", bg: "bg-blue-500/10",   text: "text-blue-700 dark:text-blue-400",     border: "border-blue-500/30" },
  geopolitical: { label: "Géopolitique",  icon: "🌍", bg: "bg-red-500/10",    text: "text-red-700 dark:text-red-400",       border: "border-red-500/30" },
  regulatory:   { label: "Réglementaire", icon: "⚖️", bg: "bg-violet-500/10", text: "text-violet-700 dark:text-violet-400", border: "border-violet-500/30" },
  sector:       { label: "Sectoriel",     icon: "🏭", bg: "bg-amber-500/10",  text: "text-amber-700 dark:text-amber-400",   border: "border-amber-500/30" },
  company:      { label: "Société",       icon: "🏢", bg: "bg-surface-alt",   text: "text-secondary",                       border: "border-edge" },
};

const CATEGORY_IMPACT: Record<string, string> = {
  macro:        "Les décisions des banques centrales et indicateurs macro pilotent les valorisations de toutes les actions.",
  geopolitical: "Les tensions géopolitiques affectent les marchés via le pétrole, les chaînes d'approvisionnement et l'aversion au risque.",
  regulatory:   "Une décision réglementaire peut redessiner toute une industrie en quelques heures.",
  sector:       "Une dynamique sectorielle peut affecter tous les acteurs d'une industrie en même temps.",
  company:      "Actualité spécifique pouvant affecter la thèse d'investissement.",
};

function MacroNewsPanelRSS({ data }: { data: any }) {
  if (data === undefined) return <div className="rounded-2xl border border-edge bg-surface h-96 animate-pulse" />;

  const articles = data?.articles ?? [];
  const computedAt = data?.computed_at ? new Date(data.computed_at) : null;
  const ageMin = computedAt ? Math.round((Date.now() - computedAt.getTime()) / 60000) : null;

  return (
    <div className="card-premium relative p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base">📰</span>
          <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-secondary"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Actualité macro & géopolitique
          </h4>
        </div>
        <span className="text-[0.7rem] text-muted">
          {articles.length > 0 && `${data.count} articles`}
          {ageMin != null && ` · maj il y a ${ageMin === 0 ? "< 1" : ageMin} min`}
        </span>
      </div>

      {data?.scanning && articles.length === 0 ? (
        <div className="py-6 text-xs text-secondary text-center">
          Récupération des sources RSS en cours...
        </div>
      ) : articles.length === 0 ? (
        <p className="py-4 text-xs text-muted italic text-center">Aucune actualité macro disponible.</p>
      ) : (
        <ul className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-2 nice-scroll">
          {articles.map((n: any, i: number) => <RssMacroRow key={i} article={n} />)}
        </ul>
      )}

      <p className="text-[0.7rem] text-muted mt-3 pt-2 border-t border-edge/40 flex-shrink-0">
        Sources gratuites : Les Échos · Boursorama · Le Monde · CNBC · MarketWatch · Yahoo Finance · Investing.com
      </p>
    </div>
  );
}

function RssMacroRow({ article }: { article: any }) {
  const style = RSS_CATEGORY_LABELS[article.category] ?? RSS_CATEGORY_LABELS.company;
  const date = article.published ? new Date(article.published) : null;
  const dateStr = date ? date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
  const langFlag = article.lang === "fr" ? "🇫🇷" : "🇬🇧";

  // Impact spécifique au lieu de générique
  const impact = getNewsImpact(article.title, article.summary || "", article.category);

  return (
    <li className="border-l-2 pl-3 py-1.5 hover:bg-bg/40 transition-colors rounded-r" style={{ borderColor: "rgb(var(--accent))" }}>
      <a href={article.link} target="_blank" rel="noopener noreferrer" className="group/news block">
        <div className="flex items-start gap-2">
          <span className="text-base flex-shrink-0">{style.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
              <span className={`text-[0.55rem] font-bold uppercase tracking-wider px-1 py-px rounded border ${style.bg} ${style.text} ${style.border}`}>
                {style.label}
              </span>
              <span className="text-[0.625rem] text-muted">{langFlag} {article.publisher}</span>
              {dateStr && <span className="text-[0.625rem] text-muted">· {dateStr}</span>}
            </div>
            <p className="text-xs text-primary leading-snug group-hover/news:text-navy dark:group-hover/news:text-accent transition-colors line-clamp-3">
              {article.title}
            </p>
            {article.tickers_mentioned?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {article.tickers_mentioned.slice(0, 5).map((t: string) => (
                  <span key={t} className="text-[0.625rem] font-mono font-bold text-navy dark:text-accent bg-navy/5 dark:bg-accent/10 px-1 py-px rounded">
                    {t}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-1.5 pl-2 border-l-2 border-amber-500/40 bg-amber-500/5 rounded-r py-1 px-2">
              <p className="text-[0.7rem] text-secondary leading-relaxed">
                💡 {impact.text}
              </p>
              {impact.affects && (
                <p className="text-[0.625rem] text-muted mt-1 font-medium">
                  📊 {impact.affects}
                </p>
              )}
            </div>
          </div>
        </div>
      </a>
    </li>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * LINKED NEWS — Actu liée à tes positions / picks (directement ou via secteur)
 * ════════════════════════════════════════════════════════════════════════ */

/* ── Panneau Linked RSS avec filtre + sources annotées ─────────────────── */

type LinkedFilter = "all" | "portfolio" | "ideas" | "picks";

function LinkedNewsPanelRSS({
  data, perTickerData, portfolioTickers, ideasTickers, picksTickers,
}: {
  data: any;
  perTickerData: any;
  portfolioTickers: Set<string>;
  ideasTickers: Set<string>;
  picksTickers: Set<string>;
}) {
  const [filter, setFilter] = useState<LinkedFilter>("all");

  if (data === undefined && perTickerData === undefined) {
    return <div className="rounded-2xl border border-edge bg-surface h-full min-h-[400px] animate-pulse" />;
  }

  // Fusionner les news macro-RSS et Google News par ticker
  const macroLinked = data?.articles ?? [];
  const perTicker = perTickerData?.articles ?? [];

  // Dédoublonnage par lien et par titre
  const seenLinks = new Set<string>();
  const seenTitleKeys = new Set<string>();
  const merged: any[] = [];
  for (const a of [...perTicker, ...macroLinked]) {  // perTicker en premier (priorité aux news ciblées)
    const link = a.link || "";
    const titleKey = (a.title || "").slice(0, 50).toLowerCase();
    if (link && seenLinks.has(link)) continue;
    if (titleKey && seenTitleKeys.has(titleKey)) continue;
    seenLinks.add(link);
    seenTitleKeys.add(titleKey);
    merged.push(a);
  }

  // Tri par date
  merged.sort((a, b) => (b.published || "").localeCompare(a.published || ""));

  // Annoter chaque article avec ses sources
  const annotated = merged.map((a: any) => {
    const sources: LinkedFilter[] = [];
    for (const t of a.tickers_mentioned ?? []) {
      const tu = t.toUpperCase();
      if (portfolioTickers.has(tu)) sources.push("portfolio");
      if (ideasTickers.has(tu))     sources.push("ideas");
      if (picksTickers.has(tu))     sources.push("picks");
    }
    return { ...a, sources: Array.from(new Set(sources)) };
  });

  // Filtrage
  const filtered = filter === "all" ? annotated : annotated.filter((a: any) => a.sources.includes(filter));

  const counts = {
    all: annotated.length,
    portfolio: annotated.filter((a: any) => a.sources.includes("portfolio")).length,
    ideas:     annotated.filter((a: any) => a.sources.includes("ideas")).length,
    picks:     annotated.filter((a: any) => a.sources.includes("picks")).length,
  };

  return (
    <div className="card-premium card-aura relative p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 flex-shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base">🎯</span>
          <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-secondary"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Actualité des cibles
          </h4>
        </div>
        <span className="text-[0.7rem] text-muted whitespace-nowrap">{filtered.length} article{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      <p className="text-xs text-muted mb-3 leading-relaxed flex-shrink-0">
        Actualités RSS mentionnant les sociétés de votre <span className="font-semibold text-secondary">portefeuille</span>,
        de vos <span className="font-semibold text-secondary">idées en suivi</span> ou des <span className="font-semibold text-secondary">picks du jour</span>.
      </p>

      {/* Menu déroulant de filtre */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <label htmlFor="linked-filter" className="text-[0.7rem] font-bold uppercase tracking-widest text-muted">Source</label>
        <select
          id="linked-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as LinkedFilter)}
          className="flex-1 text-xs bg-surface border border-edge rounded-md px-2 py-1.5
                     text-primary focus:outline-none focus:border-navy dark:focus:border-accent
                     hover:bg-bg/50 cursor-pointer transition-colors"
        >
          <option value="all">Tout ({counts.all})</option>
          <option value="portfolio">Portefeuille uniquement ({counts.portfolio})</option>
          <option value="ideas">Idées en suivi ({counts.ideas})</option>
          <option value="picks">Picks du jour ({counts.picks})</option>
        </select>
      </div>

      {data?.scanning && filtered.length === 0 ? (
        <div className="py-6 text-xs text-secondary text-center">Récupération des sources RSS...</div>
      ) : filtered.length > 0 ? (
        <ul className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-2 nice-scroll">
          {filtered.map((n: any, i: number) => <RssLinkedRow key={i} article={n} />)}
        </ul>
      ) : annotated.length > 0 ? (
        <p className="text-xs text-muted italic py-4 text-center">
          Aucun article pour ce filtre.
        </p>
      ) : (
        <div className="py-4 text-xs text-secondary leading-relaxed">
          <p>Aucune actualité liée à vos sociétés pour l&apos;instant.</p>
          <p className="text-muted text-xs mt-2">
            Plus tu ajoutes de tickers (portefeuille, idées), plus ce flux sera personnalisé.
          </p>
        </div>
      )}
    </div>
  );
}

const SOURCE_BADGES: Record<LinkedFilter, { label: string; bg: string; text: string; border: string }> = {
  all:       { label: "—", bg: "", text: "", border: "" },
  portfolio: { label: "Portef.",  bg: "bg-navy/10 dark:bg-accent/10",   text: "text-navy dark:text-accent",          border: "border-navy/20 dark:border-accent/20" },
  ideas:     { label: "Idée",     bg: "bg-emerald-500/10",              text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-500/30" },
  picks:     { label: "Pick",     bg: "bg-amber-500/10",                text: "text-amber-700 dark:text-amber-400",     border: "border-amber-500/30" },
};

function RssLinkedRow({ article }: { article: any }) {
  const date = article.published ? new Date(article.published) : null;
  const dateStr = date ? date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : null;
  const langFlag = article.lang === "fr" ? "🇫🇷" : "🇬🇧";
  const cat = RSS_CATEGORY_LABELS[article.category] ?? RSS_CATEGORY_LABELS.company;
  const sources: LinkedFilter[] = article.sources ?? [];

  return (
    <li className="border-b border-edge/30 last:border-0 pb-3 last:pb-0">
      <a href={article.link} target="_blank" rel="noopener noreferrer" className="group/news block">
        <div className="flex items-start gap-2">
          {/* Logos des tickers mentionnés (max 2) */}
          <div className="flex flex-col gap-1 flex-shrink-0">
            {article.tickers_mentioned?.slice(0, 2).map((t: string) => (
              <TickerBadge key={t} ticker={t} size="xs" showName={false} />
            ))}
          </div>
          <div className="flex-1 min-w-0">
            {/* Source badges (Portef./Idée/Pick) */}
            <div className="flex items-center gap-1 mb-1 flex-wrap">
              {sources.map((s) => {
                const sb = SOURCE_BADGES[s];
                return (
                  <span key={s} className={`text-[0.55rem] font-bold uppercase tracking-wider px-1 py-px rounded border ${sb.bg} ${sb.text} ${sb.border}`}>
                    {sb.label}
                  </span>
                );
              })}
              <span className={`text-[0.55rem] font-bold uppercase tracking-wider px-1 py-px rounded border ${cat.bg} ${cat.text} ${cat.border}`}>
                {cat.label}
              </span>
            </div>
            <p className="text-xs text-primary leading-snug group-hover/news:text-navy dark:group-hover/news:text-accent transition-colors line-clamp-3">
              {article.title}
            </p>
            {/* Résumé court de l'article */}
            {article.summary && article.summary.length > 30 && (
              <p className="text-[0.7rem] text-secondary leading-relaxed mt-1 line-clamp-2 italic">
                {article.summary}
              </p>
            )}
            <div className="flex items-center gap-1.5 mt-1 text-[0.625rem] text-muted">
              <span>{langFlag} {article.publisher}</span>
              {dateStr && <><span>·</span><span>{dateStr}</span></>}
              {article.tickers_mentioned?.length > 0 && (
                <>
                  <span>·</span>
                  <span className="truncate">{article.tickers_mentioned.slice(0, 3).map((t: string) => getTickerMeta(t).name).join(", ")}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </a>
    </li>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * STATS CARDS (inchangé, juste peaufiné)
 * ════════════════════════════════════════════════════════════════════════ */

function EarningsCard({ earnings }: { earnings: any }) {
  const next = earnings?.earnings?.[0];
  return (
    <StatCard href="/earnings" icon="⊞" label="Earnings" accent="amber" loading={earnings === undefined}>
      <BigNumber value={earnings?.count} unit="à venir" />
      {next && (
        <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-edge/50">
          <TickerBadge ticker={next.ticker} size="xs" showName={true} />
          <span className={`text-[0.625rem] font-semibold uppercase px-1.5 py-0.5 rounded border whitespace-nowrap
            ${next.days_until === 0 ? "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30"
              : "bg-surface-alt text-muted border-edge"}`}>
            {next.days_until === 0 ? "Auj." : `J-${next.days_until}`}
          </span>
        </div>
      )}
    </StatCard>
  );
}

function PortfolioCard({ portfolio }: { portfolio: any }) {
  const pnl = portfolio?.total_pnl_pct;
  const isUp = pnl != null && pnl >= 0;
  return (
    <StatCard href="/portfolio" icon="▣" label="Portefeuille" accent="navy" loading={portfolio === undefined}>
      {portfolio?.position_count > 0 ? (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-3xl font-bold font-mono ${isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {isUp ? "+" : ""}{pnl?.toFixed(1)}%
            </span>
          </div>
          <p className="text-xs text-muted mt-0.5">
            {portfolio.position_count} position{portfolio.position_count > 1 ? "s" : ""} · {portfolio.total_value?.toFixed(0)}{portfolio.currency === "EUR" ? "€" : portfolio.currency}
          </p>
          {portfolio.positions?.[0] && (
            <div className="mt-3 pt-2 border-t border-edge/50">
              <TickerBadge ticker={portfolio.positions[0].ticker} size="xs" showName={true} />
            </div>
          )}
        </>
      ) : portfolio ? (
        <EmptyAction msg="Aucune position." cta="+ Ajouter" />
      ) : null}
    </StatCard>
  );
}

function WatchlistCard({ watchlists }: { watchlists: any[] | null | undefined }) {
  return (
    <StatCard href="/watchlist" icon="◉" label="Watchlist" accent="navy" loading={watchlists === undefined}>
      {watchlists != null && watchlists.length > 0 ? (
        <>
          <BigNumber value={watchlists.length} unit={watchlists.length === 1 ? "liste" : "listes"} />
          <p className="text-xs text-secondary mt-3 truncate pt-2 border-t border-edge/50">
            {watchlists[0]?.name}
          </p>
        </>
      ) : watchlists != null ? (
        <EmptyAction msg="Aucun ticker surveillé." cta="+ Créer une liste" />
      ) : null}
    </StatCard>
  );
}

function IdeasCard({ ideas }: { ideas: any[] | null | undefined }) {
  return (
    <StatCard href="/idea" icon="◇" label="Recherche" accent="emerald" loading={ideas === undefined}>
      {ideas != null && ideas.length > 0 ? (
        <>
          <BigNumber value={ideas.length} unit={ideas.length === 1 ? "idée" : "idées"} />
          <ul className="mt-3 space-y-1 pt-2 border-t border-edge/50">
            {ideas.slice(0, 3).map((i: any) => (
              <li key={i.id} className="flex items-center justify-between gap-2 text-xs">
                <TickerBadge ticker={i.ticker} size="xs" showName={false} />
                <ConvictionDot level={i.conviction} />
              </li>
            ))}
          </ul>
        </>
      ) : ideas != null ? (
        <EmptyAction msg="Aucune idée enregistrée." cta="+ Soumettre" />
      ) : null}
    </StatCard>
  );
}

function AlertsCard({ alerts }: { alerts: any }) {
  return (
    <Link href="/alerts" className="block group">
      <div className="relative rounded-2xl border border-edge bg-gradient-to-br from-amber-500/5 via-surface to-surface
                      p-5 overflow-hidden hover:shadow-lg transition-all duration-300
                      hover:border-amber-500/30 h-full flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl text-amber-600 dark:text-amber-400">⚡</span>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-primary"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Alertes
              </h3>
              <p className="text-xs text-muted mt-0.5">
                {alerts ? `${alerts.count} alerte${alerts.count !== 1 ? "s" : ""} active${alerts.count !== 1 ? "s" : ""}` : "Chargement..."}
              </p>
            </div>
          </div>
          <span className="text-muted group-hover:text-amber-600 dark:group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all">→</span>
        </div>

        {alerts?.alerts?.length > 0 ? (
          <ul className="space-y-2">
            {alerts.alerts.slice(0, 4).map((a: any, i: number) => (
              <li key={i} className="flex items-center justify-between gap-2 p-2 rounded-lg hover:bg-bg/60 transition-colors">
                <TickerBadge ticker={a.ticker} size="xs" showName={true} />
                <span className="text-xs text-secondary truncate max-w-[200px]">{a.condition}</span>
              </li>
            ))}
          </ul>
        ) : alerts != null ? (
          <div className="flex flex-col items-start gap-3 py-2 flex-1">
            <p className="text-sm text-secondary leading-relaxed">
              Aucune alerte active. Configure des seuils prix ou événements pour être notifié dès qu&apos;un mouvement
              justifie ton attention.
            </p>
            <span className="text-[0.7rem] font-bold uppercase tracking-widest px-2 py-1 rounded
                             bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30">
              + Créer une alerte
            </span>
          </div>
        ) : (
          <ListSkeleton rows={3} />
        )}
      </div>
    </Link>
  );
}

function AnalystCard() {
  return (
    <Link href="/analyst" className="block group">
      <div className="relative rounded-2xl border border-edge bg-gradient-to-br from-emerald-500/5 via-surface to-surface
                      p-5 overflow-hidden hover:shadow-lg transition-all duration-300
                      hover:border-emerald-500/30 h-full">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative h-full flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl text-emerald-600 dark:text-emerald-400">⧫</span>
              <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-primary"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Analyste IA
              </h3>
            </div>
            <span className="text-[0.625rem] font-bold uppercase tracking-widest px-2 py-0.5 rounded
                             bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
              IA
            </span>
          </div>

          <p className="text-sm text-secondary leading-relaxed mb-4 flex-1">
            Thèses d&apos;investissement profondes générées par un agent qui raisonne comme Warren Buffett.
            Croisement de 12 sources : yfinance, SEC EDGAR, Google News, sites corporate, comparaison concurrents.
          </p>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <Stat label="Sources" value="12" sublabel="croisées" />
            <Stat label="Univers" value="67" sublabel="tickers" />
            <Stat label="Coût" value="0€" sublabel="clipboard" />
          </div>

          <div className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400 group-hover:gap-2 transition-all">
            <span>Lancer une analyse</span>
            <span>→</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * Composants génériques
 * ════════════════════════════════════════════════════════════════════════ */

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="w-1 h-4 bg-accent rounded-full" />
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="section-title-hint mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function StatCard({ href, icon, label, accent, loading, children }: {
  href: string; icon: string; label: string;
  accent: "navy" | "emerald" | "amber"; loading?: boolean;
  children: React.ReactNode;
}) {
  const accents: Record<string, string> = {
    navy:    "from-navy/5",
    emerald: "from-emerald-500/5",
    amber:   "from-amber-500/5",
  };
  return (
    <Link href={href} className="block group">
      <div className={`relative rounded-2xl border border-edge bg-gradient-to-br ${accents[accent]} via-surface to-surface
                       p-4 overflow-hidden hover:shadow-md transition-all duration-300
                       hover:border-navy/25 dark:hover:border-accent/25 h-full`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base text-accent/60 group-hover:text-accent transition-colors">{icon}</span>
            <h3 className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-secondary group-hover:text-navy dark:group-hover:text-accent transition-colors"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {label}
            </h3>
          </div>
          <span className="text-muted group-hover:text-navy dark:group-hover:text-accent text-xs">→</span>
        </div>
        {loading ? <ListSkeleton rows={2} /> : children}
      </div>
    </Link>
  );
}

function BigNumber({ value, unit }: { value: number | null | undefined; unit: string }) {
  if (value == null) return <span className="text-xs text-muted italic">Indisponible</span>;
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-3xl font-bold text-primary"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        {value}
      </span>
      <span className="text-xs text-muted">{unit}</span>
    </div>
  );
}

function Stat({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div>
      <p className="text-[0.625rem] font-bold uppercase tracking-widest text-muted">{label}</p>
      <p className="text-lg font-bold text-primary mt-0.5"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{value}</p>
      {sublabel && <p className="text-[0.625rem] text-muted">{sublabel}</p>}
    </div>
  );
}

function ConvictionDot({ level }: { level: string }) {
  const styles: Record<string, string> = {
    "fort":   "bg-emerald-500",
    "moyen":  "bg-amber-500",
    "faible": "bg-red-400",
  };
  return (
    <span className="flex items-center gap-1">
      <span className={`w-1.5 h-1.5 rounded-full ${styles[level] ?? "bg-muted"}`} />
      <span className="text-[0.7rem] text-muted capitalize">{level}</span>
    </span>
  );
}

function ScoreGauge({ value, size = 60 }: { value: number; size?: number }) {
  const pct = Math.min(100, (value / 10) * 100);
  const color = value >= 7.5 ? "text-emerald-600 dark:text-emerald-400 stroke-emerald-500"
              : value >= 6.5 ? "text-amber-600 dark:text-amber-400 stroke-amber-500"
              :                "text-muted stroke-muted";
  const radius = size * 0.36;
  const stroke = size > 50 ? 3 : 2.5;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const center = size / 2;
  const fontSize = size > 50 ? "text-base" : size > 40 ? "text-xs" : "text-[0.7rem]";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={center} cy={center} r={radius} className="fill-none stroke-edge" strokeWidth={stroke} />
        <circle cx={center} cy={center} r={radius}
          className={`fill-none ${color}`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`${fontSize} font-bold ${color}`}
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {value.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

function EmptyAction({ msg, cta }: { msg: string; cta: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-secondary">{msg}</p>
      <span className="text-[0.7rem] font-bold uppercase tracking-widest px-2 py-1 rounded inline-block w-fit
                       bg-navy/10 text-navy dark:bg-accent/10 dark:text-accent border border-navy/20 dark:border-accent/20">
        {cta}
      </span>
    </div>
  );
}

function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2.5">
          <div className="w-6 h-6 rounded bg-surface-alt" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-20 bg-surface-alt rounded" />
            <div className="h-2 w-32 bg-surface-alt rounded" />
          </div>
          <div className="h-5 w-12 bg-surface-alt rounded" />
        </div>
      ))}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * CARDS COMPACTES — pour la colonne droite (tout doit rentrer)
 * ════════════════════════════════════════════════════════════════════════ */

function CompactCard({ href, accent, children }: {
  href: string; accent: "navy" | "emerald" | "amber"; children: React.ReactNode;
}) {
  return (
    <Link href={href} className="block group h-full">
      <div className="card-premium relative p-4 overflow-hidden h-full flex flex-col">
        {children}
      </div>
    </Link>
  );
}

function CompactHeader({ icon, label, badge, badgeColor = "default" }: {
  icon: string; label: string; badge?: React.ReactNode; badgeColor?: keyof typeof BADGE_COLORS;
}) {
  return (
    <div className="flex items-center justify-between mb-2.5 flex-shrink-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-base text-accent/60 group-hover:text-accent transition-colors flex-shrink-0">{icon}</span>
        <h3 className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-secondary truncate"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {label}
        </h3>
      </div>
      {badge && (
        <span className={`text-[0.7rem] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap flex-shrink-0 ${BADGE_COLORS[badgeColor]}`}>
          {badge}
        </span>
      )}
    </div>
  );
}

const BADGE_COLORS = {
  default: "bg-surface-alt text-secondary border-edge",
  green:   "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  red:     "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
  amber:   "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  blue:    "bg-navy/10 text-navy dark:bg-accent/10 dark:text-accent border-navy/20 dark:border-accent/20",
  orange:  "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30",
};

/* ── Compact: Recherche ───────────────────────────────────────────────── */
function CompactIdeasCard({ ideas }: { ideas: any[] | null | undefined }) {
  return (
    <CompactCard href="/idea" accent="emerald">
      <CompactHeader icon="◇" label="Recherche" badge={ideas != null ? `${ideas.length} idées` : "..."} />
      {ideas != null && ideas.length > 0 ? (
        <ul className="space-y-1">
          {ideas.slice(0, 4).map((i: any) => (
            <li key={i.id} className="flex items-center justify-between gap-2 text-[0.7rem]">
              <TickerBadge ticker={i.ticker} size="xs" showName={false} />
              <ConvictionDot level={i.conviction} />
            </li>
          ))}
        </ul>
      ) : ideas != null ? (
        <p className="text-[0.7rem] text-muted italic">Aucune idée enregistrée.</p>
      ) : <ListSkeleton rows={2} />}
    </CompactCard>
  );
}

/* ── Compact: Earnings ────────────────────────────────────────────────── */
function CompactEarningsCard({ earnings }: { earnings: any }) {
  const next = earnings?.earnings?.[0];
  return (
    <CompactCard href="/earnings" accent="amber">
      <CompactHeader icon="⊞" label="Earnings" badge={earnings != null ? `${earnings.count}` : "..."} />
      {earnings != null ? (
        <>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-primary"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{earnings.count}</span>
            <span className="text-[0.625rem] text-muted">à venir</span>
          </div>
          {next && (
            <div className="flex items-center justify-between gap-1 mt-1.5 pt-1.5 border-t border-edge/40">
              <TickerBadge ticker={next.ticker} size="xs" showName={false} />
              <span className={`text-[0.55rem] font-bold px-1 py-px rounded border whitespace-nowrap
                ${next.days_until === 0 ? "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30"
                  : "bg-surface-alt text-muted border-edge"}`}>
                {next.days_until === 0 ? "Auj." : `J-${next.days_until}`}
              </span>
            </div>
          )}
        </>
      ) : <div className="h-10 bg-surface-alt rounded animate-pulse" />}
    </CompactCard>
  );
}

/* ── Compact: Portefeuille ────────────────────────────────────────────── */
function CompactPortfolioCard({ portfolio }: { portfolio: any }) {
  const pnl = portfolio?.total_pnl_pct;
  const isUp = pnl != null && pnl >= 0;
  return (
    <CompactCard href="/portfolio" accent="navy">
      <CompactHeader
        icon="▣" label="Portefeuille"
        badge={pnl != null ? `${isUp ? "+" : ""}${pnl.toFixed(1)}%` : "..."}
        badgeColor={pnl != null ? (isUp ? "green" : "red") : "default"}
      />
      {portfolio?.position_count > 0 ? (
        <>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-primary"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {portfolio.total_value?.toFixed(0)}
            </span>
            <span className="text-[0.625rem] text-muted">{portfolio.currency === "EUR" ? "€" : portfolio.currency}</span>
          </div>
          <p className="text-[0.625rem] text-muted mt-0.5">{portfolio.position_count} pos.</p>
          {portfolio.positions?.[0] && (
            <div className="mt-1.5 pt-1.5 border-t border-edge/40">
              <TickerBadge ticker={portfolio.positions[0].ticker} size="xs" showName={false} />
            </div>
          )}
        </>
      ) : portfolio != null ? (
        <p className="text-[0.7rem] text-muted italic">Aucune position.</p>
      ) : <div className="h-10 bg-surface-alt rounded animate-pulse" />}
    </CompactCard>
  );
}

/* ── Compact: Watchlist ───────────────────────────────────────────────── */
function CompactWatchlistCard({ watchlists }: { watchlists: any[] | null | undefined }) {
  return (
    <CompactCard href="/watchlist" accent="navy">
      <CompactHeader icon="◉" label="Watchlist" badge={watchlists != null ? `${watchlists.length}` : "..."} />
      {watchlists != null && watchlists.length > 0 ? (
        <>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-primary"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{watchlists.length}</span>
            <span className="text-[0.625rem] text-muted">{watchlists.length === 1 ? "liste" : "listes"}</span>
          </div>
          <p className="text-[0.625rem] text-secondary truncate mt-0.5">{watchlists[0]?.name}</p>
        </>
      ) : watchlists != null ? (
        <p className="text-[0.7rem] text-muted italic">Aucun ticker surveillé.</p>
      ) : <div className="h-10 bg-surface-alt rounded animate-pulse" />}
    </CompactCard>
  );
}

/* ── Compact: Alertes ─────────────────────────────────────────────────── */
function CompactAlertsCard({ alerts }: { alerts: any }) {
  const count = alerts?.count ?? null;
  return (
    <CompactCard href="/alerts" accent="amber">
      <CompactHeader icon="⚡" label="Alertes" badge={count != null ? `${count}` : "..."}
        badgeColor={count != null && count > 0 ? "orange" : "default"} />
      {alerts != null ? (
        count > 0 ? (
          <ul className="space-y-1">
            {alerts.alerts.slice(0, 2).map((a: any, i: number) => (
              <li key={i} className="flex items-center gap-1.5 text-[0.7rem]">
                <TickerBadge ticker={a.ticker} size="xs" showName={false} />
                <span className="text-secondary truncate">{a.condition}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[0.7rem] text-secondary leading-snug">
            Aucune alerte active. Configure des seuils pour être notifié.
          </p>
        )
      ) : <div className="h-10 bg-surface-alt rounded animate-pulse" />}
    </CompactCard>
  );
}

/* ── Compact: Analyste IA ─────────────────────────────────────────────── */
function CompactAnalystCard() {
  return (
    <CompactCard href="/analyst" accent="emerald">
      <CompactHeader icon="⧫" label="Analyste IA" badge="IA" badgeColor="green" />
      <p className="text-[0.7rem] text-secondary leading-snug mb-1.5">
        Thèses profondes · agent Warren Buffett · 12 sources.
      </p>
      <div className="flex items-center justify-between gap-1 text-[0.625rem] pt-1.5 border-t border-edge/40">
        <div>
          <p className="font-bold text-primary text-xs"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>67</p>
          <p className="text-muted">tickers</p>
        </div>
        <div>
          <p className="font-bold text-primary text-xs"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>12</p>
          <p className="text-muted">sources</p>
        </div>
        <div>
          <p className="font-bold text-emerald-700 dark:text-emerald-400 text-xs"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>0€</p>
          <p className="text-muted">coût</p>
        </div>
      </div>
    </CompactCard>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * CARDS ENRICHIES — colonne droite, 2x2, plus de contenu
 * ════════════════════════════════════════════════════════════════════════ */

function RichEarningsCard({ earnings }: { earnings: any }) {
  const list = earnings?.earnings ?? [];
  return (
    <CompactCard href="/earnings" accent="amber">
      <CompactHeader icon="⊞" label="Earnings" badge={earnings != null ? `${earnings.count} à venir` : "..."} />
      {earnings != null && list.length > 0 ? (
        <ul className="space-y-1.5 flex-1">
          {list.slice(0, 5).map((e: any, i: number) => {
            const meta = getTickerMeta(e.ticker);
            return (
              <li key={i} className="flex items-center gap-2 py-1 border-b border-edge/30 last:border-0">
                <TickerBadge ticker={e.ticker} size="xs" showName={false} />
                <span className="text-[0.7rem] text-secondary truncate flex-1">{meta.name}</span>
                <span className={`text-[0.625rem] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap flex-shrink-0
                  ${e.days_until === 0 ? "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30"
                    : e.days_until <= 3 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                    : "bg-surface-alt text-muted border-edge"}`}>
                  {e.days_until === 0 ? "Auj." : `J-${e.days_until}`}
                </span>
              </li>
            );
          })}
        </ul>
      ) : earnings != null ? (
        <p className="text-xs text-muted italic">Aucune publication à venir.</p>
      ) : <ListSkeleton rows={3} />}
    </CompactCard>
  );
}

function RichPortfolioCard({ portfolio }: { portfolio: any }) {
  const pnl = portfolio?.total_pnl_pct;
  const isUp = pnl != null && pnl >= 0;
  const positions = portfolio?.positions ?? [];

  return (
    <CompactCard href="/portfolio" accent="navy">
      <CompactHeader
        icon="▣" label="Portefeuille"
        badge={pnl != null ? `${isUp ? "+" : ""}${pnl.toFixed(1)}%` : "..."}
        badgeColor={pnl != null ? (isUp ? "green" : "red") : "default"}
      />
      {portfolio != null && positions.length > 0 ? (
        <>
          <div className="flex items-baseline justify-between gap-2 mb-2 pb-2 border-b border-edge/40">
            <div>
              <span className="text-2xl font-bold text-primary"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {portfolio.total_value?.toFixed(0)}
              </span>
              <span className="text-[0.7rem] text-muted ml-1">{portfolio.currency === "EUR" ? "€" : portfolio.currency}</span>
            </div>
            <div className="text-right">
              <p className={`text-sm font-bold font-mono ${isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {isUp ? "+" : ""}{portfolio.total_pnl?.toFixed(0)}{portfolio.currency === "EUR" ? "€" : ""}
              </p>
              <p className="text-[0.625rem] text-muted">PnL latent</p>
            </div>
          </div>
          <ul className="space-y-1 flex-1">
            {positions.slice(0, 4).map((p: any, i: number) => (
              <li key={i} className="flex items-center gap-2 text-[0.7rem]">
                <TickerBadge ticker={p.ticker} size="xs" showName={false} />
                <span className="text-muted truncate flex-1 font-mono">{p.quantity?.toFixed(0)}×</span>
                <span className={`font-mono font-bold ${(p.pnl_pct ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  {(p.pnl_pct ?? 0) >= 0 ? "+" : ""}{p.pnl_pct?.toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : portfolio != null ? (
        <div className="flex flex-col gap-2 flex-1">
          <p className="text-xs text-secondary leading-snug">Aucune position ouverte.</p>
          <span className="text-[0.7rem] font-bold uppercase tracking-widest px-2 py-1 rounded inline-block w-fit
                           bg-navy/10 text-navy dark:bg-accent/10 dark:text-accent border border-navy/20 dark:border-accent/20">
            + Ouvrir une position
          </span>
        </div>
      ) : <ListSkeleton rows={3} />}
    </CompactCard>
  );
}

function RichWatchlistCard({ watchlists }: { watchlists: any[] | null | undefined }) {
  return (
    <CompactCard href="/watchlist" accent="navy">
      <CompactHeader icon="◉" label="Watchlist" badge={watchlists != null ? `${watchlists.length} ${watchlists.length <= 1 ? "liste" : "listes"}` : "..."} />
      {watchlists != null && watchlists.length > 0 ? (
        <ul className="space-y-1.5 flex-1">
          {watchlists.slice(0, 5).map((w: any) => (
            <li key={w.id} className="flex items-center justify-between gap-2 py-1 border-b border-edge/30 last:border-0">
              <span className="text-xs text-primary truncate font-medium">{w.name}</span>
              <span className="text-[0.625rem] font-mono font-bold text-navy dark:text-accent bg-navy/5 dark:bg-accent/10 px-1.5 py-0.5 rounded">
                {w.item_count ?? 0}
              </span>
            </li>
          ))}
        </ul>
      ) : watchlists != null ? (
        <div className="flex flex-col gap-2 flex-1">
          <p className="text-xs text-secondary leading-snug">
            Aucun ticker surveillé. Crée une watchlist pour suivre les sociétés qui t&apos;intéressent.
          </p>
          <span className="text-[0.7rem] font-bold uppercase tracking-widest px-2 py-1 rounded inline-block w-fit
                           bg-navy/10 text-navy dark:bg-accent/10 dark:text-accent border border-navy/20 dark:border-accent/20">
            + Créer une watchlist
          </span>
        </div>
      ) : <ListSkeleton rows={3} />}
    </CompactCard>
  );
}

function RichAlertsCard({ alerts }: { alerts: any }) {
  const count = alerts?.count ?? null;
  const list = alerts?.alerts ?? [];
  return (
    <CompactCard href="/alerts" accent="amber">
      <CompactHeader icon="⚡" label="Alertes" badge={count != null ? `${count} active${count !== 1 ? "s" : ""}` : "..."}
        badgeColor={count != null && count > 0 ? "orange" : "default"} />
      {alerts != null && count > 0 ? (
        <ul className="space-y-1.5 flex-1">
          {list.slice(0, 5).map((a: any, i: number) => (
            <li key={i} className="flex items-center gap-2 py-1 border-b border-edge/30 last:border-0">
              <TickerBadge ticker={a.ticker} size="xs" showName={false} />
              <span className="text-[0.7rem] text-secondary truncate flex-1">{a.condition}</span>
            </li>
          ))}
        </ul>
      ) : alerts != null ? (
        <div className="flex flex-col gap-2 flex-1">
          <p className="text-xs text-secondary leading-snug">
            Aucune alerte active. Configure des seuils prix ou événements pour être notifié.
          </p>
          <span className="text-[0.7rem] font-bold uppercase tracking-widest px-2 py-1 rounded inline-block w-fit
                           bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30">
            + Créer une alerte
          </span>
        </div>
      ) : <ListSkeleton rows={3} />}
    </CompactCard>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * LaurelWreath — Couronne de laurier dorée en SVG (sceau impérial)
 * ════════════════════════════════════════════════════════════════════════ */

function LaurelWreath() {
  return (
    <svg viewBox="0 0 100 100" className="w-[78%] h-[78%]" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="laurel-stem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="rgb(168 204 224)" />
          <stop offset="50%"  stopColor="rgb(94 150 176)" />
          <stop offset="100%" stopColor="rgb(168 204 224)" />
        </linearGradient>
        <radialGradient id="laurel-leaf" cx="0.3" cy="0.3" r="0.8">
          <stop offset="0%"   stopColor="rgb(200 226 240)" />
          <stop offset="55%"  stopColor="rgb(94 150 176)" />
          <stop offset="100%" stopColor="rgb(45 74 92)" />
        </radialGradient>
      </defs>

      {/* Branche gauche : 6 feuilles disposées en arc */}
      <g fill="url(#laurel-leaf)" stroke="rgb(45 74 92)" strokeWidth="0.4">
        <ellipse cx="32" cy="78" rx="3.2" ry="7" transform="rotate(-65 32 78)" />
        <ellipse cx="22" cy="68" rx="3.2" ry="7" transform="rotate(-45 22 68)" />
        <ellipse cx="16" cy="55" rx="3.2" ry="7" transform="rotate(-20 16 55)" />
        <ellipse cx="16" cy="40" rx="3.2" ry="7" transform="rotate(0 16 40)" />
        <ellipse cx="22" cy="27" rx="3.2" ry="7" transform="rotate(25 22 27)" />
        <ellipse cx="33" cy="18" rx="2.8" ry="6" transform="rotate(50 33 18)" />
      </g>

      {/* Tige gauche (fine) */}
      <path d="M 35 80 Q 18 65 14 45 Q 14 28 28 16"
        fill="none" stroke="url(#laurel-stem)" strokeWidth="1.2" strokeLinecap="round" />

      {/* Branche droite : symétrique */}
      <g fill="url(#laurel-leaf)" stroke="rgb(45 74 92)" strokeWidth="0.4">
        <ellipse cx="68" cy="78" rx="3.2" ry="7" transform="rotate(65 68 78)" />
        <ellipse cx="78" cy="68" rx="3.2" ry="7" transform="rotate(45 78 68)" />
        <ellipse cx="84" cy="55" rx="3.2" ry="7" transform="rotate(20 84 55)" />
        <ellipse cx="84" cy="40" rx="3.2" ry="7" transform="rotate(0 84 40)" />
        <ellipse cx="78" cy="27" rx="3.2" ry="7" transform="rotate(-25 78 27)" />
        <ellipse cx="67" cy="18" rx="2.8" ry="6" transform="rotate(-50 67 18)" />
      </g>

      {/* Tige droite */}
      <path d="M 65 80 Q 82 65 86 45 Q 86 28 72 16"
        fill="none" stroke="url(#laurel-stem)" strokeWidth="1.2" strokeLinecap="round" />

      {/* Étoile au sommet */}
      <g transform="translate(50 24)">
        <path
          d="M 0 -7 L 1.8 -2.2 L 7 -2.2 L 2.8 1 L 4.4 6 L 0 3 L -4.4 6 L -2.8 1 L -7 -2.2 L -1.8 -2.2 Z"
          fill="url(#laurel-stem)"
          stroke="rgb(45 74 92)"
          strokeWidth="0.3"
        />
      </g>

      {/* Petit ruban en bas */}
      <path d="M 42 84 Q 50 90 58 84 L 56 88 Q 50 92 44 88 Z"
        fill="url(#laurel-stem)" stroke="rgb(45 74 92)" strokeWidth="0.3" />
    </svg>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * FleurDeLys — Symbole héraldique du royaume de France (SVG épuré)
 * ════════════════════════════════════════════════════════════════════════ */

function FleurDeLys({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 100 120"
      className={className}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
    >
      {/* Pétale central (haut) */}
      <path d="M 50 5
               C 48 18 45 25 42 35
               C 40 42 42 50 50 55
               C 58 50 60 42 58 35
               C 55 25 52 18 50 5 Z" />

      {/* Pétale gauche (courbe extérieure vers la gauche) */}
      <path d="M 50 30
               C 35 20 18 30 12 50
               C 8 65 18 75 32 70
               C 42 67 48 60 50 50 Z" />

      {/* Pétale droit (mirroir) */}
      <path d="M 50 30
               C 65 20 82 30 88 50
               C 92 65 82 75 68 70
               C 58 67 52 60 50 50 Z" />

      {/* Bandeau central horizontal (lien) */}
      <rect x="22" y="58" width="56" height="6" rx="1" />

      {/* Pied/Base (vase stylisé) */}
      <path d="M 38 70
               L 30 90
               Q 30 95 35 95
               L 65 95
               Q 70 95 70 90
               L 62 70 Z" />

      {/* Petite tige basse */}
      <rect x="46" y="95" width="8" height="20" rx="1" />
      <ellipse cx="50" cy="118" rx="14" ry="2.5" />
    </svg>
  );
}
