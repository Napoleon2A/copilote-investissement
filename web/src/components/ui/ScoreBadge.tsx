import clsx from "clsx";

interface Props {
  score: number;
  label?: string;
  size?: "sm" | "md";
}

export function ScoreBadge({ score, label, size = "md" }: Props) {
  const color =
    score >= 7.5
      ? "bg-green-50 text-green-700 border-green-200"
      : score >= 5
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-red-50 text-red-700 border-red-200";

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 border rounded font-mono font-medium",
        color,
        size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm"
      )}
    >
      {score.toFixed(1)}
      {label && <span className="opacity-60">· {label}</span>}
    </span>
  );
}
