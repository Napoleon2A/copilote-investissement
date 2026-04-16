import clsx from "clsx";

interface Props {
  value?: number | null;
  suffix?: string;
  className?: string;
}

/**
 * Affiche une variation avec couleur automatique (vert/rouge).
 * Adapté pour fond clair — tons plus sombres que le mode sombre.
 */
export function ChangeCell({ value, suffix = "%", className }: Props) {
  if (value === null || value === undefined) {
    return <span className="text-muted">—</span>;
  }

  const isUp = value > 0;
  const isFlat = value === 0;

  return (
    <span
      className={clsx(
        "font-mono text-sm",
        isFlat ? "text-secondary" : isUp ? "text-green-700" : "text-red-700",
        className
      )}
    >
      {isUp && "+"}
      {value.toFixed(2)}
      {suffix}
    </span>
  );
}
