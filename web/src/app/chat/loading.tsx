import { SkeletonLine } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonLine className="h-7 w-32" />
      <div className="rounded-lg border border-edge bg-surface p-4 space-y-4 min-h-[400px]">
        <div className="flex gap-3">
          <div className="animate-pulse h-8 w-8 rounded-full bg-surface-alt" />
          <div className="space-y-2 flex-1">
            <SkeletonLine className="w-3/4" />
            <SkeletonLine className="w-1/2" />
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <div className="space-y-2 flex-1 max-w-[70%]">
            <SkeletonLine className="w-full" />
            <SkeletonLine className="w-2/3" />
          </div>
          <div className="animate-pulse h-8 w-8 rounded-full bg-surface-alt" />
        </div>
      </div>
    </div>
  );
}
