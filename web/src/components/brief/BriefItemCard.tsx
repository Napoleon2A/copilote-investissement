import Link from "next/link";
import { ChangeCell } from "@/components/ui/ChangeCell";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import type { BriefItem, BriefPosition } from "@/lib/api";

const ACTION_COLORS: Record<string, string> = {
  watch:         "text-blue-700",
  read:          "text-amber-700",
  buy_small:     "text-green-700",
  add:           "text-green-700",
  reduce:        "text-orange-600",
  avoid:         "text-red-700",
  hold:          "text-[#2D4A5C]",
  review_thesis: "text-purple-700",
};

export function BriefItemCard({ item }: { item: BriefItem }) {
  const actionColor = ACTION_COLORS[item.action] || "text-[#2D4A5C]";

  return (
    <div className="rounded-lg border border-[#BFD0DC] bg-white p-4 hover:border-[#1E3A5F]/30 hover:shadow-sm transition-all duration-150">
      <div className="flex items-start justify-between gap-4">
        {/* Ticker + prix */}
        <div>
          <Link
            href={`/company/${item.ticker}`}
            className="text-base font-bold text-[#1E3A5F] hover:text-[#162d4a] font-mono"
          >
            {item.ticker}
          </Link>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {item.current_price && (
              <span className="text-sm text-[#0B1929] font-mono">
                {item.current_price.toLocaleString()}
              </span>
            )}
            <ChangeCell value={item.change_1d} />
            {item.change_1m !== undefined && (
              <ChangeCell value={item.change_1m} className="text-[#7898AC] text-xs" />
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
        <p className="text-sm text-[#2D4A5C] mt-2 leading-relaxed">
          {item.why_now}
        </p>
      )}

      {/* P&L de la position */}
      {item.position && <PositionPnl pos={item.position} />}

      {/* Signaux supplémentaires */}
      {item.signals.length > 1 && (
        <ul className="mt-2 space-y-0.5">
          {item.signals.slice(1).map((signal, i) => (
            <li key={i} className="text-xs text-[#7898AC] flex gap-1">
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
    <div className="mt-2 flex items-center gap-3 text-xs text-[#7898AC] border-t border-[#BFD0DC] pt-2 flex-wrap">
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
