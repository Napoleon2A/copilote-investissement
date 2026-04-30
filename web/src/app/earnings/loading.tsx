import { SkeletonTable, SkeletonLine } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonLine className="h-7 w-48" />
      <SkeletonTable rows={8} cols={5} />
    </div>
  );
}
