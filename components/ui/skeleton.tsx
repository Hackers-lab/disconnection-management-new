import { cn } from "@/lib/utils"

function Skeleton({
  className,
  shimmer = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { shimmer?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-md bg-slate-200/80 dark:bg-slate-800",
        shimmer ? "animate-shimmer" : "animate-pulse",
        className
      )}
      {...props}
    />
  )
}

/**
 * Pre-built 3-Zone Skeleton Card matching the physical consumer card silhouette
 */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-white rounded-2xl border border-slate-200/95 border-l-[5px] border-l-slate-300 shadow-[0_3px_10px_-3px_rgba(15,23,42,0.08)] overflow-hidden",
        className
      )}
    >
      {/* Tinted Header Strip */}
      <div className="px-3.5 py-3 bg-slate-50/80 border-b border-slate-200/70 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-4 w-8 rounded-md" />
            <Skeleton className="h-4 w-12 rounded-md" />
          </div>
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-3/4 rounded-lg" />
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-28 rounded" />
            <Skeleton className="h-3.5 w-24 rounded" />
          </div>
        </div>
      </div>

      {/* Body + Financial Tile */}
      <div className="p-3.5 space-y-3">
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-full rounded" />
          <Skeleton className="h-3.5 w-4/5 rounded" />
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-2.5 grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Skeleton className="h-2.5 w-16 rounded" />
            <Skeleton className="h-5 w-24 rounded-md" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-2.5 w-16 rounded" />
            <Skeleton className="h-4 w-20 rounded-md" />
          </div>
        </div>
      </div>

      {/* Tinted Footer Bar */}
      <div className="px-3.5 py-2.5 bg-slate-50/80 border-t border-slate-200/70 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-7 w-14 rounded-lg" />
            <Skeleton className="h-7 w-7 rounded-lg" />
            <Skeleton className="h-7 w-7 rounded-lg" />
          </div>
          <Skeleton className="h-7 w-16 rounded-lg" />
        </div>
        <Skeleton className="h-9 w-full rounded-lg" />
      </div>
    </div>
  )
}

/**
 * Pre-built Skeleton Table Rows for data tables
 */
export function SkeletonTable({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/95 overflow-hidden shadow-xs">
      <div className="p-3 bg-slate-50/90 border-b border-slate-200 flex items-center gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1 rounded" />
        ))}
      </div>
      <div className="divide-y divide-slate-100 p-2 space-y-3">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 py-2">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-4 flex-1 rounded" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export { Skeleton }
