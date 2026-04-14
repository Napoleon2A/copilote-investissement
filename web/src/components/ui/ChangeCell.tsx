import clsx from "clsx";

interface Props {
  value?: number | null;
  suffix?: string;
  className?: string;
}

/**
 * Affiche une variation avec couleur automatique (vert/rouge).
 * Utilisé dans les tableaux de prix et les cartes de brief.
 */
export function ChangeCell({ value, suffix = "%", className }: Props) {
  if (value === null || value === undefined) {
    return <span className="text-slate-600">—</span>;
  }

  const isUp = value > 0;
  const isFlat = value === 0;

  return (
    <span
      className={clsx(
        "font-mono text-sm",
        isFlat ? "text-slate-400" : isUp ? "text-green-400" : "text-red-400",
        className
      )}
    >
      {isUp && "+"}
      {value.toFixed(2)}
      {suffix}
    </span>
  );
}
