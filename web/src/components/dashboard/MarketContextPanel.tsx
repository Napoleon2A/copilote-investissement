"use client";

import Link from "next/link";
import {
  explainSectorRotation, buildMarketReasoning,
  explainVixContextual, explainIndexContextual,
  explainTreasury10YContextual, explainDollarContextual,
  explainGoldContextual, explainOilContextual,
  explainRegimeContextual,
  type MarketSnapshot,
} from "@/lib/macroExplainer";
import { ExplainBlock, IndicatorBlock, formatChange, TONE_DOT_COLORS } from "./shared";

interface MarketContextPanelProps {
  ctx: any;
  marketSummary: any;
  loading: boolean;
}

export function MarketContextPanel({ ctx, marketSummary, loading }: MarketContextPanelProps) {
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

  // Snapshot global pour les fonctions contextuelles
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

  const reasoning = buildMarketReasoning(
    snapshot.vix,
    snapshot.sp500_ytd,
    snapshot.sp500_1m,
    snapshot.us10y,
    snapshot.dxy_1m,
    snapshot.wti_ytd,
    snapshot.gold_ytd,
  );

  const regimeExp = explainRegimeContextual(ctx.regime, ctx.regime_label, snapshot);
  const vixExp = explainVixContextual(snapshot);
  const rotationExp = explainSectorRotation(ctx.sector_rotation?.leaders, ctx.sector_rotation?.laggards);

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
        {/* Synthèse "pourquoi" */}
        <div className="rounded-xl border border-edge/50 bg-surface/60 backdrop-blur-sm p-3 mb-4">
          <p className="text-[0.7rem] font-bold uppercase tracking-widest text-muted mb-2">📊 Pourquoi ce diagnostic ?</p>
          <div className="space-y-1">
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
          <p className="text-xs text-primary mt-2 pt-2 border-t border-edge/40 font-medium leading-relaxed">
            → {reasoning.conclusion}
          </p>
        </div>

        <ExplainBlock dotColor={TONE_DOT_COLORS[regimeExp.tone]} headline={regimeExp.headline} detail={regimeExp.detail} />

        {vixExp && (
          <div className="mt-3 pt-3 border-t border-edge/40">
            <ExplainBlock dotColor={TONE_DOT_COLORS[vixExp.tone]} headline={vixExp.headline} detail={vixExp.detail} />
          </div>
        )}

        {/* Indices */}
        {sp500 && (
          <div className="mt-3 pt-3 border-t border-edge/40">
            <p className="text-[0.7rem] font-bold uppercase tracking-widest text-muted mb-2">📈 Indices boursiers</p>
            <div className="space-y-2">
              <IndicatorBlock
                name="S&P 500" exp={explainIndexContextual("S&P 500", "S&P 500", sp500.change_ytd, sp500.change_1m, 10.5)}
                detail={`${sp500.price?.toFixed(0)} pts · ${formatChange(sp500.change_1d)}j · ${formatChange(sp500.change_1m)} 1M · ${formatChange(sp500.change_ytd)} YTD`}
              />
              {nasdaq && (
                <IndicatorBlock
                  name="NASDAQ" exp={explainIndexContextual("NASDAQ (tech US)", "NASDAQ", nasdaq.change_ytd, nasdaq.change_1m, 12.0)}
                  detail={`${nasdaq.price?.toFixed(0)} pts · ${formatChange(nasdaq.change_1d)}j · ${formatChange(nasdaq.change_1m)} 1M · ${formatChange(nasdaq.change_ytd)} YTD`}
                />
              )}
              {cac40 && (
                <IndicatorBlock
                  name="CAC 40" exp={explainIndexContextual("CAC 40 (Paris)", "CAC 40", cac40.change_ytd, cac40.change_1m, 7.5)}
                  detail={`${cac40.price?.toFixed(0)} pts · ${formatChange(cac40.change_1d)}j · ${formatChange(cac40.change_1m)} 1M · ${formatChange(cac40.change_ytd)} YTD`}
                />
              )}
            </div>
          </div>
        )}

        {/* Taux 10Y contextuel */}
        {us10y && (() => {
          const exp = explainTreasury10YContextual(snapshot);
          return exp && (
            <div className="mt-3 pt-3 border-t border-edge/40">
              <p className="text-[0.7rem] font-bold uppercase tracking-widest text-muted mb-2">💵 Taux d&apos;intérêt</p>
              <IndicatorBlock name="US 10Y" exp={exp} detail={`Rendement actuel : ${us10y.price?.toFixed(2)}%`} />
            </div>
          );
        })()}

        {/* Dollar / Or / Pétrole contextuels */}
        {(dxy || gold || wti) && (
          <div className="mt-3 pt-3 border-t border-edge/40">
            <p className="text-[0.7rem] font-bold uppercase tracking-widest text-muted mb-2">🌐 Devises & matières premières</p>
            <div className="space-y-2">
              {dxy && (() => {
                const exp = explainDollarContextual(snapshot);
                return exp && <IndicatorBlock name="Dollar" exp={exp} />;
              })()}
              {gold && (() => {
                const exp = explainGoldContextual(snapshot);
                return exp && <IndicatorBlock name="Or" exp={exp} />;
              })()}
              {wti && (() => {
                const exp = explainOilContextual(snapshot);
                return exp && <IndicatorBlock name="Pétrole" exp={exp} />;
              })()}
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
