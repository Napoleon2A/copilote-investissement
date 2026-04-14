import clsx from "clsx";

interface Props {
  score: number;
  label?: string;
  size?: "sm" | "md";
}

export function ScoreBadge({ score, label, size = "md" }: Props) {
  const color =
    score >= 7.5
      ? "bg-green-500/20 text-green-400 border-green-500/30"
      : score >= 5
      ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
      : "bg-red-500/20 text-red-400 border-red-500/30";

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 border rounded font-mono",
        color,
        size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm"
      )}
    >
      {score.toFixed(1)}
      {label && <span className="opacity-70">· {label}</span>}
    </span>
  );
}
