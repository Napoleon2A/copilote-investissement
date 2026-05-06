"use client";

import Link from "next/link";
import { TickerBadge } from "@/components/ui/TickerBadge";
import { getTickerMeta, SECTOR_COLORS, SECTOR_LABEL } from "@/lib/tickerMeta";
import { SectionTitle } from "./shared";
import type { EarningsTrade } from "@/lib/api";

interface Props {
  trades: EarningsTrade[] | undefined;
}

export function OperationsCTPanel({ trades }: Props) {
  if (trades === undefined) {
    return (
      <div className="card-premium relative p-5 h-full flex flex-col">
        <SectionTitle title="Opérations court terme" subtitle="Chargement..." />
        <div className="space-y-2 flex-1 min-h-0">
          {[1, 2, 3].map((i) => <div key={i} className="rounded-lg border border-edge bg-surface h-16 animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="card-premium relative p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <SectionTitle title="Opérations court terme" subtitle={`${trades.length} trade${trades.length > 1 ? "s" : ""} actif${trades.length > 1 ? "s" : ""} avant earnings`} />
        <Link href="/operations-ct" className="text-[0.7rem] text-muted hover:text-navy dark:hover:text-accent transition-colors whitespace-nowrap">
          Voir tout →
        </Link>
      </div>

      {trades.length === 0 ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center px-4">
          <p className="text-sm text-secondary mb-2">Aucune opération CT active.</p>
          <Link
            href="/operations-ct"
            className="text-xs font-medium px-3 py-1.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/20"
          >
            Générer le mégaprompt earnings
          </Link>
          <p className="text-[0.7rem] text-muted mt-2">Trade des publications de résultats avec une thèse Claude (gratuit, copier-coller).</p>
        </div>
      ) : (
        <ul className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-2 nice-scroll">
          {trades.map((t) => <CompactTrade key={t.id} trade={t} />)}
        </ul>
      )}

      <p className="text-[0.7rem] text-muted mt-3 pt-2 border-t border-edge/40 flex-shrink-0">
        Workflow : prompt → claude.ai → import. Pas d'exécution auto, à toi de passer les ordres.
      </p>
    </div>
  );
}

function CompactTrade({ trade }: { trade: EarningsTrade }) {
  const meta = getTickerMeta(trade.ticker);
  const sector = meta.sector;
  const sectorStyle = sector ? SECTOR_COLORS[sector] : null;
  const isImminent = trade.days_until_earnings <= 3;
  const convStyle = trade.claude_conviction === "élevé"
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40"
    : trade.claude_conviction === "moyen"
    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
    : "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30";

  return (
    <li>
      <Link href={`/company/${trade.ticker}`} className="block group">
        <div className="card-premium card-aura relative px-3 py-2 overflow-hidden">
          <div className="flex items-center gap-2.5">
            <TickerBadge ticker={trade.ticker} size="md" showName={false} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-sm font-bold text-primary truncate"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                  {meta.name || trade.ticker}
                </span>
                {isImminent && (
                  <span className="text-[0.55rem] font-semibold uppercase tracking-wider px-1 py-px rounded bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/30">
                    J-{trade.days_until_earnings}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[0.65rem] text-muted font-mono">{trade.ticker}</span>
                <span className="text-[0.65rem] text-muted">earnings {trade.earnings_date}</span>
                {sectorStyle && sector && (
                  <span className={`text-[0.55rem] font-semibold uppercase tracking-wider px-1 py-px rounded border ${sectorStyle.bg} ${sectorStyle.text} ${sectorStyle.border}`}>
                    {SECTOR_LABEL[sector]}
                  </span>
                )}
                <span className={`text-[0.55rem] font-semibold uppercase tracking-wider px-1 py-px rounded border ${convStyle}`}>
                  {trade.claude_conviction}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
              {trade.expected_surprise_pct != null && (
                <span className={`text-xs font-mono font-bold ${trade.expected_surprise_pct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  {trade.expected_surprise_pct >= 0 ? "+" : ""}{trade.expected_surprise_pct.toFixed(1)}%
                </span>
              )}
              <span className="text-[0.6rem] text-muted">
                {trade.target_buy_price != null && `→${trade.target_buy_price.toFixed(0)}$`}
                {trade.target_sell_price != null && ` ↗${trade.target_sell_price.toFixed(0)}$`}
              </span>
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}
