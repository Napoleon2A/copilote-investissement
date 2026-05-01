"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TickerBadge } from "@/components/ui/TickerBadge";
import { Sparkline } from "@/components/ui/Sparkline";
import { getTickerMeta, SECTOR_COLORS, SECTOR_LABEL } from "@/lib/tickerMeta";
import {
  explainSectorRotation, buildMarketReasoning, getNewsImpact,
  explainVixContextual, explainIndexContextual,
  explainTreasury10YContextual, explainDollarContextual,
  explainGoldContextual, explainOilContextual,
  explainRegimeContextual,
  type MarketSnapshot,
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

export default function BriefPage() {
  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const [brief, setBrief] = useState<any>(undefined);
  const [macroNews, setMacroNews] = useState<any>(undefined);

  useEffect(() => {
    fetchJSON<any>(`${API}/brief`).then(setBrief);
    fetchJSON<any>(`${API}/news/macro?limit=10`).then(setMacroNews);
  }, []);

  const items = brief?.items ?? [];
  const portfolioItems   = items.filter((i: any) => i.type === "portfolio_alert");
  const watchlistItems   = items.filter((i: any) => i.type === "watchlist_signal");
  const ideaItems        = items.filter((i: any) => i.type === "idea_followup");
  const opportunityItems = items.filter((i: any) => i.type === "opportunity");
  const analystItems     = items.filter((i: any) => i.type === "analyst_thesis");

  const hasSignals = portfolioItems.length + watchlistItems.length + ideaItems.length + analystItems.length > 0;

  return (
    <div className="space-y-6 pb-6">

      {/* Header de page */}
      <div className="flex items-end justify-between gap-4 pb-4 border-b border-edge/40">
        <div className="flex items-center gap-4">
          <div className="w-1 h-12 bg-gradient-to-b from-accent to-navy rounded-full" />
          <div>
            <Link href="/" className="text-xs text-muted hover:text-navy dark:hover:text-accent transition-colors flex items-center gap-1 mb-1">
              <span>←</span> <span>Retour au tableau de bord</span>
            </Link>
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-primary leading-tight"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Brief du jour
            </h1>
            <p className="text-sm text-muted capitalize mt-1">{today}</p>
          </div>
        </div>
        {brief?.item_count != null && (
          <div className="text-right">
            <p className="text-3xl font-bold text-primary"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {brief.item_count}
            </p>
            <p className="text-xs text-muted uppercase tracking-widest mt-0.5">signaux</p>
          </div>
        )}
      </div>

      {/* Contexte macro complet */}
      {brief?.market_context && (
        <MacroFullPanel ctx={brief.market_context} marketSummary={brief.market_summary} />
      )}

      {/* Sections par catégorie de signaux */}
      {brief && hasSignals && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {portfolioItems.length > 0 && (
            <CategorySection title="Alertes portefeuille" icon="▣" accent="navy" items={portfolioItems} />
          )}
          {watchlistItems.length > 0 && (
            <CategorySection title="Signaux watchlist" icon="◉" accent="navy" items={watchlistItems} />
          )}
          {ideaItems.length > 0 && (
            <CategorySection title="Idées en suivi" icon="◇" accent="emerald" items={ideaItems} />
          )}
          {opportunityItems.length > 0 && (
            <CategorySection title="Opportunités" icon="◎" accent="emerald" items={opportunityItems} />
          )}
          {analystItems.length > 0 && (
            <CategorySection title="Thèses analyste" icon="⧫" accent="amber" items={analystItems} />
          )}
        </div>
      )}

      {/* Pas de signaux */}
      {brief && !hasSignals && (
        <div className="card-premium p-8 text-center">
          <p className="text-primary">Aucun signal prioritaire aujourd&apos;hui.</p>
          <p className="text-sm text-muted mt-1">
            Les alertes apparaîtront ici dès qu&apos;un mouvement justifie ton attention.
          </p>
        </div>
      )}

      {/* Fil d'actualités macro */}
      <NewsSection news={macroNews} />

      {/* Disclaimer */}
      {brief?.disclaimer && (
        <p className="text-xs text-muted text-center pt-2">{brief.disclaimer}</p>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * MACRO FULL PANEL — version étendue de la homepage
 * ════════════════════════════════════════════════════════════════════════ */

function MacroFullPanel({ ctx, marketSummary }: { ctx: any; marketSummary: any }) {
  const ms = marketSummary ?? {};
  const sp500 = ms.SP500;
  const nasdaq = ms.NASDAQ;
  const cac40 = ms.CAC40;
  const us10y = ms.US10Y;
  const dxy = ms.DXY;
  const gold = ms.Or;
  const wti = ms.WTI;

  const snapshot: MarketSnapshot = {
    vix: ctx.vix ?? null,
    vix_change_1m: ms.VIX?.change_1m ?? null,
    sp500_price: sp500?.price ?? null,
    sp500_ytd: sp500?.change_ytd ?? null,
    sp500_1m: sp500?.change_1m ?? null,
    nasdaq_ytd: nasdaq?.change_ytd ?? null,
    nasdaq_1m: nasdaq?.change_1m ?? null,
    cac40_ytd: cac40?.change_ytd ?? null,
    cac40_1m: cac40?.change_1m ?? null,
    us10y: us10y?.price ?? null,
    us10y_1m_change: us10y?.change_1m ?? null,
    dxy: dxy?.price ?? null,
    dxy_1m: dxy?.change_1m ?? null,
    gold_ytd: gold?.change_ytd ?? null,
    wti_ytd: wti?.change_ytd ?? null,
    wti_1m: wti?.change_1m ?? null,
  };

  const regimeExp = explainRegimeContextual(ctx.regime, ctx.regime_label, snapshot);
  const vixExp = explainVixContextual(snapshot);
  const rotationExp = explainSectorRotation(ctx.sector_rotation?.leaders, ctx.sector_rotation?.laggards);

  const reasoning = buildMarketReasoning(
    snapshot.vix,
    snapshot.sp500_ytd, snapshot.sp500_1m,
    snapshot.us10y, snapshot.dxy_1m,
    snapshot.wti_ytd, snapshot.gold_ytd,
  );

  const TONE_DOT: Record<string, string> = {
    positive: "bg-emerald-500", negative: "bg-red-500",
    neutral: "bg-blue-500", warning: "bg-amber-500",
  };

  return (
    <div className="card-premium card-aura relative p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">🌍</span>
        <h2 className="section-title">Comprendre le marché aujourd&apos;hui</h2>
      </div>

      {/* Synthèse */}
      <div className="rounded-xl border border-edge/50 bg-surface/60 p-4 mb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-muted mb-2">📊 Pourquoi ce diagnostic ?</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {reasoning.positive.map((s, i) => (
            <div key={`p${i}`} className="flex items-start gap-2 text-xs text-secondary">
              <span className="text-emerald-600 dark:text-emerald-400 flex-shrink-0">✓</span>
              <span className="leading-snug">{s}</span>
            </div>
          ))}
          {reasoning.negative.map((s, i) => (
            <div key={`n${i}`} className="flex items-start gap-2 text-xs text-secondary">
              <span className="text-red-600 dark:text-red-400 flex-shrink-0">⚠</span>
              <span className="leading-snug">{s}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-primary mt-3 pt-3 border-t border-edge/40 font-medium leading-relaxed">
          → {reasoning.conclusion}
        </p>
      </div>

      {/* Régime + VIX */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <ExplainBlock dot={TONE_DOT[regimeExp.tone]} title={regimeExp.headline} text={regimeExp.detail} />
        {vixExp && <ExplainBlock dot={TONE_DOT[vixExp.tone]} title={vixExp.headline} text={vixExp.detail} />}
      </div>

      {/* Indices boursiers en grille */}
      {sp500 && (
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-widest text-muted mb-2">📈 Indices boursiers</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {sp500 && <IndicatorMini name="S&P 500" data={sp500} exp={explainIndexContextual("S&P 500", "S&P 500", sp500.change_ytd, sp500.change_1m, 10.5)} />}
            {nasdaq && <IndicatorMini name="NASDAQ" data={nasdaq} exp={explainIndexContextual("NASDAQ", "NASDAQ", nasdaq.change_ytd, nasdaq.change_1m, 12.0)} />}
            {cac40 && <IndicatorMini name="CAC 40" data={cac40} exp={explainIndexContextual("CAC 40", "CAC 40", cac40.change_ytd, cac40.change_1m, 7.5)} />}
          </div>
        </div>
      )}

      {/* Macro indicators (taux, dollar, or, pétrole) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {us10y && (() => {
          const exp = explainTreasury10YContextual(snapshot);
          return exp && <MacroMini name="Taux 10Y US" value={`${us10y.price?.toFixed(2)}%`} exp={exp} />;
        })()}
        {dxy && (() => {
          const exp = explainDollarContextual(snapshot);
          return exp && <MacroMini name="Dollar (DXY)" value={dxy.price?.toFixed(1)} exp={exp} />;
        })()}
        {gold && (() => {
          const exp = explainGoldContextual(snapshot);
          return exp && <MacroMini name="Or" value={`${gold.price?.toFixed(0)}$`} exp={exp} />;
        })()}
        {wti && (() => {
          const exp = explainOilContextual(snapshot);
          return exp && <MacroMini name="Pétrole WTI" value={`${wti.price?.toFixed(1)}$`} exp={exp} />;
        })()}
      </div>

      {/* Rotation sectorielle */}
      {rotationExp && (
        <div className="pt-3 border-t border-edge/40">
          <p className="text-xs font-bold uppercase tracking-widest text-muted mb-2">↻ Rotation sectorielle</p>
          <p className="text-xs text-secondary leading-relaxed mb-2">{rotationExp}</p>
          {ctx.sector_rotation?.leaders?.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[0.625rem] font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 mb-1">↑ Sur-performance</p>
                <ul className="space-y-0.5">
                  {ctx.sector_rotation.leaders.slice(0, 5).map((s: any, i: number) => (
                    <li key={i} className="flex items-center justify-between text-xs">
                      <span className="text-secondary">{s.sector}</span>
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
                        <span className="text-secondary">{s.sector}</span>
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
  );
}

function ExplainBlock({ dot, title, text }: { dot: string; title: string; text: string }) {
  return (
    <div className="rounded-lg bg-surface/40 p-3 border border-edge/30">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-2 h-2 rounded-full ${dot} animate-pulse`} />
        <h5 className="text-sm font-semibold text-primary"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{title}</h5>
      </div>
      <p className="text-xs text-secondary leading-relaxed pl-4">{text}</p>
    </div>
  );
}

function IndicatorMini({ name, data, exp }: { name: string; data: any; exp: any }) {
  const isUp = (data.change_ytd ?? 0) >= 0;
  return (
    <div className="rounded-lg bg-surface/40 p-3 border border-edge/30">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[0.7rem] font-bold uppercase tracking-wider text-secondary">{name}</p>
        <span className={`text-xs font-mono ${isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
          {isUp ? "+" : ""}{data.change_ytd?.toFixed(1)}% YTD
        </span>
      </div>
      <p className="text-lg font-bold text-primary mb-1"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{data.price?.toFixed(0)}</p>
      <p className="text-[0.7rem] text-secondary leading-snug">{exp.detail}</p>
    </div>
  );
}

function MacroMini({ name, value, exp }: { name: string; value: string; exp: any }) {
  const TONE_BG: Record<string, string> = {
    positive: "border-emerald-500/30 bg-emerald-500/5",
    negative: "border-red-500/30 bg-red-500/5",
    neutral:  "border-blue-500/30 bg-blue-500/5",
    warning:  "border-amber-500/30 bg-amber-500/5",
  };
  return (
    <div className={`rounded-lg p-3 border ${TONE_BG[exp.tone]}`}>
      <p className="text-[0.625rem] font-bold uppercase tracking-wider text-muted">{name}</p>
      <p className="text-base font-bold text-primary mt-0.5"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{value}</p>
      <p className="text-[0.7rem] text-secondary leading-snug mt-1 line-clamp-2">{exp.detail}</p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * SECTIONS PAR CATÉGORIE D'ITEMS
 * ════════════════════════════════════════════════════════════════════════ */

function CategorySection({ title, icon, accent, items }: {
  title: string; icon: string; accent: "navy" | "emerald" | "amber"; items: any[];
}) {
  return (
    <div className="card-premium relative p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">{icon}</span>
          <h2 className="section-title">{title}</h2>
        </div>
        <span className="text-xs text-muted">{items.length}</span>
      </div>

      <ul className="space-y-2">
        {items.map((item: any, i: number) => (
          <BriefItemRow key={i} item={item} />
        ))}
      </ul>
    </div>
  );
}

function BriefItemRow({ item }: { item: any }) {
  const meta = getTickerMeta(item.ticker);
  const isUp = (item.change_1d ?? 0) >= 0;
  const score = item.scores?.composite;

  return (
    <Link href={`/company/${item.ticker}`}
      className="flex items-start gap-3 p-3 rounded-lg hover:bg-bg/60 transition-colors group">
      <TickerBadge ticker={item.ticker} size="md" showName={true} showSector />
      <div className="ml-auto flex flex-col items-end gap-1 flex-shrink-0">
        <Sparkline ticker={item.ticker} width={70} height={22} />
        <div className="flex items-center gap-2 text-xs">
          {item.change_1d != null && (
            <span className={`font-mono font-medium ${isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {isUp ? "+" : ""}{item.change_1d.toFixed(2)}%
            </span>
          )}
          {score != null && (
            <span className={`text-[0.625rem] font-bold px-1.5 py-0.5 rounded border
              ${score >= 7.5 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                : score >= 6.5 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                : "bg-surface-alt text-muted border-edge"}`}>
              {score.toFixed(1)}
            </span>
          )}
        </div>
        <span className="text-[0.7rem] text-muted">{item.action_label}</span>
      </div>
    </Link>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * NEWS SECTION — Fil RSS macro
 * ════════════════════════════════════════════════════════════════════════ */

function NewsSection({ news }: { news: any }) {
  if (news === undefined) {
    return <div className="card-premium p-5 h-32 animate-pulse" />;
  }

  const articles = news?.articles ?? [];

  return (
    <div className="card-premium p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-lg">📰</span>
          <h2 className="section-title">Actualité macro & géopolitique</h2>
        </div>
        <span className="text-xs text-muted">{news?.count ?? 0} articles</span>
      </div>

      {articles.length > 0 ? (
        <ul className="space-y-3">
          {articles.slice(0, 8).map((a: any, i: number) => <BriefNewsRow key={i} article={a} />)}
        </ul>
      ) : (
        <p className="text-xs text-muted italic py-4 text-center">Aucune actualité macro disponible.</p>
      )}
    </div>
  );
}

const CATEGORY_ICON: Record<string, string> = {
  macro: "🏦", geopolitical: "🌍", regulatory: "⚖️", sector: "🏭", company: "🏢",
};
const CATEGORY_LABEL: Record<string, string> = {
  macro: "Macro", geopolitical: "Géopolitique", regulatory: "Réglementaire", sector: "Sectoriel", company: "Société",
};

function BriefNewsRow({ article }: { article: any }) {
  const date = article.published ? new Date(article.published) : null;
  const dateStr = date ? date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
  const langFlag = article.lang === "fr" ? "🇫🇷" : "🇬🇧";
  const impact = getNewsImpact(article.title, article.summary || "", article.category);
  const icon = CATEGORY_ICON[article.category] ?? "🏢";
  const label = CATEGORY_LABEL[article.category] ?? "Société";

  return (
    <li className="border-l-2 border-accent/30 pl-3 py-1 hover:bg-bg/30 transition-colors rounded-r">
      <a href={article.link} target="_blank" rel="noopener noreferrer" className="group/news block">
        <div className="flex items-start gap-2">
          <span className="text-base flex-shrink-0">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-[0.625rem] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-surface-alt text-secondary border-edge">
                {label}
              </span>
              <span className="text-[0.625rem] text-muted">{langFlag} {article.publisher}</span>
              {dateStr && <span className="text-[0.625rem] text-muted">· {dateStr}</span>}
            </div>
            <p className="text-sm text-primary leading-snug group-hover/news:text-navy dark:group-hover/news:text-accent transition-colors line-clamp-2">
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
              <p className="text-[0.7rem] text-secondary leading-relaxed">💡 {impact.text}</p>
              {impact.affects && (
                <p className="text-[0.625rem] text-muted mt-1 font-medium">📊 {impact.affects}</p>
              )}
            </div>
          </div>
        </div>
      </a>
    </li>
  );
}
