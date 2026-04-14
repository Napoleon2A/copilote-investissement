import { ChangeCell } from "@/components/ui/ChangeCell";
import type { MarketIndex } from "@/lib/api";

interface Props {
  data: Record<string, MarketIndex>;
}

export function MarketSummary({ data }: Props) {
  if (!data || Object.keys(data).length === 0) return null;

  return (
    <div className="rounded-lg border border-[#2a2d3a] bg-[#1a1d27] p-3">
      <div className="flex flex-wrap gap-6">
        {Object.entries(data).map(([name, index]) => (
          <div key={name} className="flex flex-col gap-0.5">
            <span className="text-xs text-slate-600 uppercase tracking-wide">{name}</span>
            <div className="flex items-baseline gap-2">
              {index.price !== null && (
                <span className="text-sm font-mono text-slate-300">
                  {index.price?.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}
                </span>
              )}
              <ChangeCell value={index.change_1d} />
            </div>
            {index.change_ytd !== null && (
              <span className="text-xs text-slate-600">
                YTD : <ChangeCell value={index.change_ytd} className="text-xs" />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
