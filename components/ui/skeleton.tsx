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
 * Compact Skeleton Card matching the streamlined field card silhouette
 */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-white rounded-xl border border-slate-200/95 border-l-4 border-l-slate-300 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.08)] overflow-hidden",
        className
      )}
    >
      {/* Slim Tinted Header */}
      <div className="px-2.5 py-2 bg-slate-50/80 border-b border-slate-200/70 space-y-1.5">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1">
            <Skeleton className="h-3.5 w-7 rounded" />
            <Skeleton className="h-3.5 w-11 rounded" />
          </div>
          <Skeleton className="h-4 w-16 rounded-full" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-4 w-3/5 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
        </div>
      </div>

      {/* Compact Body */}
      <div className="px-2.5 py-2 space-y-1.5">
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-4/5 rounded" />
        <div className="flex items-center justify-between pt-1">
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="h-3 w-24 rounded" />
        </div>
      </div>

      {/* Single-Row Compact Action Footer */}
      <div className="px-2.5 py-1.5 bg-slate-50/80 border-t border-slate-200/70 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Skeleton className="h-7 w-12 rounded-md" />
          <Skeleton className="h-7 w-7 rounded-md" />
          <Skeleton className="h-7 w-7 rounded-md" />
        </div>
        <Skeleton className="h-7 w-20 rounded-md" />
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
