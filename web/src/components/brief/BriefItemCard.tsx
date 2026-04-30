import Link from "next/link";
import { ChangeCell } from "@/components/ui/ChangeCell";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import type { BriefItem, BriefPosition } from "@/lib/api";

const ACTION_COLORS: Record<string, string> = {
  watch:         "text-blue-700 dark:text-blue-400",
  read:          "text-amber-700 dark:text-amber-400",
  buy_small:     "text-green-700 dark:text-green-400",
  buy:           "text-green-700 dark:text-green-400",
  add:           "text-green-700 dark:text-green-400",
  reduce:        "text-orange-600 dark:text-orange-400",
  avoid:         "text-red-700 dark:text-red-400",
  hold:          "text-secondary",
  review_thesis: "text-purple-700 dark:text-purple-400",
};

const VERDICT_BADGE: Record<string, string> = {
  buy: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700",
  watch: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700",
  avoid: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700",
};

export function BriefItemCard({ item }: { item: BriefItem }) {
  const actionColor = ACTION_COLORS[item.action] || "text-secondary";

  return (
    <div className="rounded-lg border border-edge bg-surface p-4 hover:border-navy/30 hover:shadow-sm transition-all duration-150">
      <div className="flex items-start justify-between gap-4">
        {/* Ticker + prix */}
        <div>
          <Link
            href={`/company/${item.ticker}`}
            className="text-base font-bold text-navy hover:text-navy-hover font-mono"
          >
            {item.ticker}
          </Link>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {item.current_price && (
              <span className="text-sm text-primary font-mono">
                {item.current_price.toLocaleString()}
              </span>
            )}
            <ChangeCell value={item.change_1d} />
            {item.change_1m !== undefined && (
              <ChangeCell value={item.change_1m} className="text-muted text-xs" />
            )}
          </div>
        </div>

        {/* Score + action */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {item.scores?.composite !== undefined && (
            <ScoreBadge score={item.scores.composite} size="sm" />
          )}
          <span className={`text-xs font-medium ${actionColor}`}>
            → {item.action_label}
          </span>
        </div>
      </div>

      {/* Pourquoi maintenant */}
      {item.why_now && (
        <p className="text-sm text-secondary mt-2 leading-relaxed">
          {item.why_now}
        </p>
      )}

      {/* Analyst thesis — rendu enrichi */}
      {item.analyst_data && (
        <div className="mt-3 space-y-2 border-t border-edge pt-2">
          {/* Verdict badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border uppercase ${VERDICT_BADGE[item.analyst_data.verdict_action] ?? VERDICT_BADGE.watch}`}>
              {item.analyst_data.verdict_action}
            </span>
            <span className="text-[10px] text-muted">
              Conviction : <strong className="text-primary">{item.analyst_data.verdict_conviction}</strong>
            </span>
            {item.analyst_data.verdict_horizon && (
              <span className="text-[10px] text-muted">
                Horizon : <strong className="text-primary">{item.analyst_data.verdict_horizon}</strong>
              </span>
            )}
            {item.analyst_data.ideal_entry_price != null && (
              <span className="text-[10px] text-muted">
                Entrée : <strong className="text-primary font-mono">${item.analyst_data.ideal_entry_price.toFixed(0)}</strong>
              </span>
            )}
          </div>
          {/* Business summary court */}
          {item.analyst_data.business_summary && (
            <p className="text-xs text-secondary leading-relaxed line-clamp-3">
              {item.analyst_data.business_summary}
            </p>
          )}
          {/* Risques */}
          {item.analyst_data.specific_risks && (
            <p className="text-[10px] text-muted leading-relaxed line-clamp-2">
              Risques : {item.analyst_data.specific_risks}
            </p>
          )}
          {/* Date */}
          {item.analyst_data.generated_at && (
            <p className="text-[10px] text-muted">
              Analyse du {new Date(item.analyst_data.generated_at).toLocaleDateString("fr-FR")}
            </p>
          )}
        </div>
      )}

      {/* P&L de la position */}
      {item.position && <PositionPnl pos={item.position} />}

      {/* Signaux supplémentaires */}
      {item.signals.length > 1 && (
        <ul className="mt-2 space-y-0.5">
          {item.signals.slice(1).map((signal, i) => (
            <li key={i} className="text-xs text-muted flex gap-1">
              <span>·</span>
              <span>{signal}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PositionPnl({ pos }: { pos: BriefPosition }) {
  const isPositive = pos.pnl >= 0;
  const color = isPositive ? "text-green-700" : "text-red-700";
  return (
    <div className="mt-2 flex items-center gap-3 text-xs text-muted border-t border-edge pt-2 flex-wrap">
      <span>{pos.quantity} actions × {pos.avg_cost.toFixed(2)} {pos.currency}</span>
      <span>→</span>
      <span className={`font-mono font-medium ${color}`}>
        {isPositive ? "+" : ""}{pos.pnl.toFixed(2)} {pos.currency}
        {pos.pnl_pct != null && (
          <span className="ml-1 opacity-60">({isPositive ? "+" : ""}{pos.pnl_pct.toFixed(1)}%)</span>
        )}
      </span>
    </div>
  );
}
