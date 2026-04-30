interface SkeletonProps {
  className?: string;
}

export function SkeletonLine({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded bg-surface-alt h-4 ${className}`}
    />
  );
}

export function SkeletonCard({ className = "" }: SkeletonProps) {
  return (
    <div className={`animate-pulse rounded-lg border border-edge bg-surface p-4 ${className}`}>
      <div className="space-y-3">
        <div className="h-5 w-1/3 rounded bg-surface-alt" />
        <div className="h-4 w-full rounded bg-surface-alt" />
        <div className="h-4 w-2/3 rounded bg-surface-alt" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4, className = "" }: SkeletonProps & { rows?: number; cols?: number }) {
  return (
    <div className={`animate-pulse rounded-lg border border-edge bg-surface overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex gap-4 p-3 border-b border-edge bg-surface-alt/50">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-4 flex-1 rounded bg-surface-alt" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 p-3 border-b border-edge last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="h-4 flex-1 rounded bg-surface-alt" />
          ))}
        </div>
      ))}
    </div>
  );
}
