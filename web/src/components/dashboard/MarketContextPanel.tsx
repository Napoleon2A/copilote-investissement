"use client";

import Link from "next/link";
import {
  explainVix, explainRegime, explainSectorRotation,
  explainIndex, explainTreasury10Y, explainDollar, explainOil, explainGold,
  buildMarketReasoning,
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

        {/* Taux 10Y */}
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
