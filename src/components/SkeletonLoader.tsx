interface SkeletonProps {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}

/** Pre-built skeleton for a test/submission card */
export function SkeletonCard() {
  return (
    <div className="border border-paper-200 bg-white p-5 dark:border-ink-700 dark:bg-ink-dark-surface">
      <Skeleton className="mb-3 h-3 w-20" />
      <Skeleton className="mb-2 h-5 w-3/4" />
      <Skeleton className="mb-4 h-4 w-full" />
      <div className="flex gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  )
}

/** Pre-built skeleton for a table row */
export function SkeletonRow({ cols = 6 }: { cols?: number }) {
  return (
    <tr className="border-b border-paper-200 dark:border-ink-700">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  )
}
