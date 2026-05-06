"use client";

import Link from "next/link";
import { TickerBadge } from "@/components/ui/TickerBadge";
import { Sparkline } from "@/components/ui/Sparkline";
import { getTickerMeta, SECTOR_COLORS, SECTOR_LABEL } from "@/lib/tickerMeta";
import { ScoreGauge, SectionTitle } from "./shared";
import type { UnifiedItem } from "@/lib/api";

interface PicksHeroProps {
  items: UnifiedItem[];
  loading: boolean;
  scanning?: boolean;
  radarLoading?: boolean;
}

export function PicksHero({ items, loading, scanning, radarLoading }: PicksHeroProps) {
  if (loading || scanning) {
    return (
      <div className="card-premium relative p-5 h-full flex flex-col">
        <SectionTitle title="Picks de la semaine" subtitle={scanning ? "Scan en cours · ~60s" : "Chargement..."} />
        <div className="space-y-2 flex-1 min-h-0">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="rounded-lg border border-edge bg-surface h-16 animate-pulse" />)}
        </div>
      </div>
    );
  }
  if (!items?.length) return null;

  const scannerCount = items.filter((i) => i.source !== "radar").length;
  const radarOnly = items.filter((i) => i.source === "radar").length;

  return (
    <div className="card-premium relative p-5 h-full flex flex-col">
      <SectionTitle
        title="Picks de la semaine"
        subtitle={
          radarLoading
            ? `${scannerCount} opportunités · radar smart-money en cours...`
            : `${scannerCount} via scanner${radarOnly > 0 ? ` + ${radarOnly} via radar smart-money` : ""}`
        }
      />
      <ul className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-2 nice-scroll">
        {items.map((item, i) => <CompactPick key={item.ticker} item={item} rank={i + 1} />)}
      </ul>
    </div>
  );
}

function CompactPick({ item, rank }: { item: UnifiedItem; rank: number }) {
  const opp = item.scanner;
  const radar = item.radar;
  const ticker = item.ticker;
  const meta = getTickerMeta(ticker);
  const sector = meta.sector;
  const sectorStyle = sector ? SECTOR_COLORS[sector] : null;
  const change = opp?.change_1d;
  const isUp = (change ?? 0) >= 0;
  const score = opp?.scores?.composite;
  const actionLabel = opp?.action_label
    ?? (radar ? `${radar.initiated_count}init / ${radar.increased_count}up` : "");

  return (
    <li>
      <Link href={`/company/${ticker}`} className="block group">
        <div className="card-premium card-aura relative px-4 py-2.5 overflow-hidden">
          <div className="flex items-center gap-3 relative">
            <TickerBadge ticker={ticker} size="md" showName={false} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[0.625rem] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                  #{rank}
                </span>
                {sectorStyle && sector && (
                  <span className={`text-[0.55rem] font-semibold uppercase tracking-wider px-1 py-px rounded border ${sectorStyle.bg} ${sectorStyle.text} ${sectorStyle.border}`}>
                    {SECTOR_LABEL[sector]}
                  </span>
                )}
                {opp?.new_opportunity && (
                  <span className="text-[0.55rem] font-semibold uppercase tracking-wider px-1 py-px rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                    Nouv.
                  </span>
                )}
                {item.source !== "scanner" && (
                  <span
                    title={
                      item.source === "radar"
                        ? "Détecté uniquement par le radar smart-money (initiation 13-F)"
                        : "Détecté par le scanner ET le radar smart-money — double signal"
                    }
                    className="text-[0.55rem] font-semibold uppercase tracking-wider px-1 py-px rounded bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/30"
                  >
                    {item.source === "radar" ? "Smart-money" : "Smart-money +"}
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-primary leading-tight truncate"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {meta.name || radar?.name || ticker}
              </h3>
              <p className="text-[0.7rem] text-muted font-mono truncate">{ticker}{actionLabel ? ` · ${actionLabel}` : ""}</p>
            </div>

            <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
              <div className="flex items-center gap-2">
                {score != null && <ScoreGauge value={score} size={32} />}
                <Sparkline ticker={ticker} width={50} height={20} />
              </div>
              {change != null && (
                <span className={`text-[0.7rem] font-mono font-bold ${isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  {isUp ? "+" : ""}{change?.toFixed(2)}%
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}
