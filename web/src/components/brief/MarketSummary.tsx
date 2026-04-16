import { ChangeCell } from "@/components/ui/ChangeCell";
import type { MarketIndex } from "@/lib/api";

interface Props {
  data: Record<string, MarketIndex>;
}

export function MarketSummary({ data }: Props) {
  if (!data || Object.keys(data).length === 0) return null;

  return (
    <div className="rounded-lg border border-[#BFD0DC] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap gap-x-5 gap-y-3 sm:gap-8">
        {Object.entries(data).map(([name, index]) => (
          <div key={name} className="flex flex-col gap-0.5">
            <span className="text-[10px] text-[#7898AC] uppercase tracking-widest font-medium">{name}</span>
            <div className="flex items-baseline gap-2">
              {index.price !== null && (
                <span className="text-sm font-mono text-[#0B1929] font-medium">
                  {index.price?.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}
                </span>
              )}
              <ChangeCell value={index.change_1d} />
            </div>
            {index.change_ytd !== null && (
              <span className="text-[10px] text-[#7898AC]">
                YTD : <ChangeCell value={index.change_ytd} className="text-[10px]" />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
