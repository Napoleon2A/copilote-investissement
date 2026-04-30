import { SkeletonCard, SkeletonLine } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <SkeletonLine className="h-7 w-48" />
      <SkeletonCard className="h-24" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
