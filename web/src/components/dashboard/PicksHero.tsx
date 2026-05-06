"use client";

import Link from "next/link";
import { TickerBadge } from "@/components/ui/TickerBadge";
import { Sparkline } from "@/components/ui/Sparkline";
import { getTickerMeta, SECTOR_COLORS, SECTOR_LABEL } from "@/lib/tickerMeta";
import { ScoreGauge, SectionTitle } from "./shared";

interface PicksHeroProps {
  picks: any[];
  loading: boolean;
  scanning?: boolean;
}

export function PicksHero({ picks, loading, scanning }: PicksHeroProps) {
  if (loading || scanning) {
    return (
      <div>
        <SectionTitle title="Picks de la semaine" subtitle={scanning ? "Scan en cours · ~60s" : "Chargement..."} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => <div key={i} className="rounded-xl border border-edge bg-surface h-24 animate-pulse" />)}
        </div>
      </div>
    );
  }
  if (!picks?.length) return null;

  return (
    <div>
      <SectionTitle title="Picks de la semaine" subtitle={`Top ${picks.length} opportunités sélectionnées par le scanner`} />
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
