import { ChangeCell } from "@/components/ui/ChangeCell";
import type { MarketIndex } from "@/lib/api";

interface Props {
  data: Record<string, MarketIndex>;
}

export function MarketSummary({ data }: Props) {
  if (!data || Object.keys(data).length === 0) return null;

  // Filtrer les clés internes (préfixées par _) qui ne sont pas des indices
  const entries = Object.entries(data).filter(([name]) => !name.startsWith("_"));

  return (
    <div className="rounded-lg border border-edge bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap gap-x-5 gap-y-3 sm:gap-8">
        {entries.map(([name, index]) => (
          <div key={name} className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted uppercase tracking-widest font-medium">{name}</span>
            <div className="flex items-baseline gap-2">
              {index.price !== null && (
                <span className="text-sm font-mono text-primary font-medium">
                  {index.price?.toLocaleString("fr-FR", { maximumFractionDigits: 0 })}
                </span>
              )}
              <ChangeCell value={index.change_1d} />
            </div>
            {index.change_ytd !== null && (
              <span className="text-[10px] text-muted">
                YTD : <ChangeCell value={index.change_ytd} className="text-[10px]" />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
