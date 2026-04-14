import Link from "next/link";
import { ChangeCell } from "@/components/ui/ChangeCell";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import type { BriefItem } from "@/lib/api";

const ACTION_COLORS: Record<string, string> = {
  watch: "text-blue-400",
  read: "text-yellow-400",
  buy_small: "text-green-400",
  add: "text-green-500",
  reduce: "text-orange-400",
  avoid: "text-red-400",
  hold: "text-slate-400",
  review_thesis: "text-purple-400",
};

export function BriefItemCard({ item }: { item: BriefItem }) {
  const actionColor = ACTION_COLORS[item.action] || "text-slate-400";

  return (
    <div className="rounded-lg border border-[#2a2d3a] bg-[#1a1d27] p-4 hover:border-indigo-500/40 transition-colors">
      <div className="flex items-start justify-between gap-4">
        {/* Ticker + prix */}
        <div>
          <Link
            href={`/company/${item.ticker}`}
            className="text-base font-bold text-indigo-300 hover:text-indigo-200 font-mono"
          >
            {item.ticker}
          </Link>
          <div className="flex items-center gap-2 mt-0.5">
            {item.current_price && (
              <span className="text-sm text-slate-300 font-mono">
                {item.current_price.toLocaleString()}
              </span>
            )}
            <ChangeCell value={item.change_1d} />
            {item.change_1m !== undefined && (
              <ChangeCell value={item.change_1m} className="text-slate-500 text-xs" />
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
        <p className="text-sm text-slate-400 mt-2 leading-relaxed">
          {item.why_now}
        </p>
      )}

      {/* Signaux supplémentaires */}
      {item.signals.length > 1 && (
        <ul className="mt-2 space-y-0.5">
          {item.signals.slice(1).map((signal, i) => (
            <li key={i} className="text-xs text-slate-600 flex gap-1">
              <span>·</span>
              <span>{signal}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
