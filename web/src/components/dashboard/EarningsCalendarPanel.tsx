"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { TickerBadge } from "@/components/ui/TickerBadge";
import { getTickerMeta, SECTOR_COLORS, SECTOR_LABEL } from "@/lib/tickerMeta";
import { IcEarnings } from "./icons";

interface EarningsCalendarPanelProps {
  earnings: any;
  portfolioTickers: Set<string>;
  ideasTickers: Set<string>;
}

type FilterMode = "all" | "mine" | "today" | "week";

export function EarningsCalendarPanel({ earnings, portfolioTickers, ideasTickers }: EarningsCalendarPanelProps) {
  const [filter, setFilter] = useState<FilterMode>("all");

  // ⚠ Tous les hooks doivent être appelés AVANT tout return early (Rules of Hooks)
  const allEarnings: any[] = earnings?.earnings ?? [];

  const annotated = useMemo(() => {
    return allEarnings.map((e) => {
      const t = e.ticker?.toUpperCase();
      return {
        ...e,
        isPortfolio: portfolioTickers.has(t),
        isIdea: ideasTickers.has(t),
        isMine: portfolioTickers.has(t) || ideasTickers.has(t),
      };
    });
  }, [allEarnings, portfolioTickers, ideasTickers]);

  const filtered = useMemo(() => {
    if (filter === "mine")  return annotated.filter(e => e.isMine);
    if (filter === "today") return annotated.filter(e => e.days_until === 0);
    if (filter === "week")  return annotated.filter(e => e.days_until <= 7);
    return annotated;
  }, [annotated, filter]);

  const counts = useMemo(() => ({
    all:   annotated.length,
    mine:  annotated.filter(e => e.isMine).length,
    today: annotated.filter(e => e.days_until === 0).length,
    week:  annotated.filter(e => e.days_until <= 7).length,
  }), [annotated]);

  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const e of filtered) {
      const key = `${e.days_until}|${e.earnings_date}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    }
    return Object.entries(groups).sort((a, b) => {
      const da = parseInt(a[0].split("|")[0], 10);
      const db = parseInt(b[0].split("|")[0], 10);
      return da - db;
    });
  }, [filtered]);

  // Loading state — APRÈS les hooks
  if (earnings === undefined) {
    return <div className="card-premium card-aura relative p-5 h-full animate-pulse" />;
  }

  return (
    <div className="card-premium card-aura relative p-5 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <IcEarnings size={18} className="text-accent" />
          <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-secondary"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Calendrier earnings
          </h4>
        </div>
        <span className="text-[0.7rem] text-muted whitespace-nowrap">
          {filtered.length} publication{filtered.length !== 1 ? "s" : ""}
          {earnings.max_days != null && ` · prochains ${earnings.max_days}j`}
        </span>
      </div>

      <p className="text-xs text-muted mb-3 leading-relaxed flex-shrink-0">
        Toutes les publications de résultats à venir. Les sociétés de votre portefeuille et idées en suivi sont mises en évidence.
      </p>

      {/* Filtres */}
      <div className="grid grid-cols-4 gap-1.5 mb-3 flex-shrink-0">
        <FilterPill label="Tout"        count={counts.all}   active={filter === "all"}   tone="info"   onClick={() => setFilter("all")}   alwaysClickable />
        <FilterPill label="Mes tickers" count={counts.mine}  active={filter === "mine"}  tone="good"   onClick={() => setFilter("mine")}  />
        <FilterPill label="Aujourd'hui" count={counts.today} active={filter === "today"} tone="orange" onClick={() => setFilter("today")} />
        <FilterPill label="Cette sem."  count={counts.week}  active={filter === "week"}  tone="warning" onClick={() => setFilter("week")} />
      </div>

      {/* Liste scrollable groupée par date */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-2 nice-scroll">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted italic text-center py-4">Aucune publication pour ce filtre.</p>
        ) : (
          <div className="space-y-3">
            {grouped.map(([key, items]) => {
              const [daysStr, dateStr] = key.split("|");
              const days = parseInt(daysStr, 10);
              return (
                <div key={key}>
                  <DateHeader days={days} dateStr={dateStr} count={items.length} />
                  <ul className="space-y-1.5 mt-1.5">
                    {items.map((e: any, i: number) => <EarningRow key={i} earning={e} />)}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Header de date pour chaque groupe ───────────────────────────────── */

function DateHeader({ days, dateStr, count }: { days: number; dateStr: string; count: number }) {
  const date = dateStr ? new Date(dateStr) : null;
  const formatted = date ? date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : "";

  let badge = "";
  let badgeColor = "bg-surface-alt text-muted border-edge";
  if (days === 0) {
    badge = "Aujourd'hui";
    badgeColor = "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30";
  } else if (days === 1) {
    badge = "Demain";
    badgeColor = "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30";
  } else if (days <= 7) {
    badge = `J-${days}`;
    badgeColor = "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30";
  } else if (days <= 14) {
    badge = `J-${days}`;
    badgeColor = "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30";
  } else {
    badge = `J-${days}`;
  }

  return (
    <div className="flex items-center gap-2 sticky top-0 bg-surface/95 backdrop-blur-sm py-1 z-10 -mx-1 px-1">
      <span className={`text-[0.625rem] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border whitespace-nowrap ${badgeColor}`}>
        {badge}
      </span>
      <span className="text-xs font-medium text-secondary capitalize">{formatted}</span>
      <span className="flex-1 h-px bg-edge/50" />
      <span className="text-[0.625rem] text-muted">{count}</span>
    </div>
  );
}

/* ── Une ligne earning ───────────────────────────────────────────────── */

function EarningRow({ earning }: { earning: any }) {
  const meta = getTickerMeta(earning.ticker);
  const sector = meta.sector;
  const sectorStyle = sector ? SECTOR_COLORS[sector] : null;
  const score = earning.scores?.composite;
  const change = earning.change_1d;
  const isUp = (change ?? 0) >= 0;

  // Highlight si dans portefeuille / idées
  const isMine = earning.isPortfolio || earning.isIdea;
  const wrapperClass = isMine
    ? "rounded-lg border-l-4 border border-edge/30 border-l-emerald-500 bg-emerald-500/5 p-2.5"
    : "rounded-lg border border-edge/30 bg-surface/40 p-2.5";

  return (
    <li className={wrapperClass}>
      <Link href={`/company/${earning.ticker}`} className="flex items-center gap-2 group/row">
        <TickerBadge ticker={earning.ticker} size="xs" showName={false} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono font-bold text-xs text-navy dark:text-accent">{earning.ticker}</span>
            {isMine && (
              <span className="text-[0.55rem] font-bold uppercase tracking-wider px-1 py-px rounded
                               bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                {earning.isPortfolio ? "Portef." : "Idée"}
              </span>
            )}
            {sectorStyle && sector && (
              <span className={`text-[0.55rem] font-semibold uppercase tracking-wider px-1 py-px rounded border ${sectorStyle.bg} ${sectorStyle.text} ${sectorStyle.border}`}>
                {SECTOR_LABEL[sector]}
              </span>
            )}
          </div>
          <p className="text-[0.7rem] text-secondary truncate mt-0.5">{meta.name}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {score != null && (
            <span className={`text-[0.625rem] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap
              ${score >= 7.5 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                : score >= 6.5 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                : "bg-surface-alt text-muted border-edge"}`}>
              {score.toFixed(1)}
            </span>
          )}
          {change != null && (
            <span className={`text-[0.7rem] font-mono font-medium w-14 text-right ${isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {isUp ? "+" : ""}{change.toFixed(2)}%
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

/* ── Filter pill ─────────────────────────────────────────────────────── */

const PILL_STYLES: Record<string, string> = {
  info:    "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
  good:    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  orange:  "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30",
};
const RING_STYLES: Record<string, string> = {
  info:    "ring-blue-500/60",
  good:    "ring-emerald-500/60",
  warning: "ring-amber-500/60",
  orange:  "ring-orange-500/60",
};

function FilterPill({ label, count, active, tone, onClick, alwaysClickable }: {
  label: string; count: number; active: boolean; tone: keyof typeof PILL_STYLES;
  onClick: () => void; alwaysClickable?: boolean;
}) {
  const hasSignal = count > 0;
  const isClickable = alwaysClickable || hasSignal;
  const baseClass = (hasSignal || alwaysClickable) ? PILL_STYLES[tone] : "bg-surface-alt text-muted border-edge";
  const activeClass = active ? `ring-2 ring-offset-1 ring-offset-bg ${RING_STYLES[tone]}` : "";
  const interactive = isClickable ? "cursor-pointer hover:scale-[1.03] active:scale-95 transition-transform" : "";

  return (
    <button type="button" onClick={isClickable ? onClick : undefined} disabled={!isClickable}
      className={`rounded-md border px-2 py-1.5 text-center w-full ${baseClass} ${activeClass} ${interactive}`}>
      <p className="text-base font-bold leading-none"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{count}</p>
      <p className="text-[0.55rem] uppercase tracking-widest mt-0.5">{label}</p>
    </button>
  );
}
