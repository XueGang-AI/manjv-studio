export default function ProjectsLoading() {
  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[var(--radius-lg)] bg-[var(--bg-panel)] animate-pulse" />
          <div>
            <div className="h-6 w-24 bg-[var(--bg-panel)] rounded animate-pulse mb-1" />
            <div className="h-4 w-40 bg-[var(--bg-panel)] rounded animate-pulse" />
          </div>
        </div>
        <div className="h-10 w-24 bg-[var(--bg-panel)] rounded-[var(--radius-md)] animate-pulse" />
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-[var(--bg-elevated)] border border-[var(--color-border-dim)] rounded-[var(--radius-lg)] p-4">
            <div className="h-3 w-12 bg-[var(--bg-panel)] rounded animate-pulse mb-3" />
            <div className="h-8 w-8 bg-[var(--bg-panel)] rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Filter skeleton */}
      <div className="mb-6 space-y-3">
        <div className="flex gap-3">
          <div className="h-10 flex-1 bg-[var(--bg-elevated)] border border-[var(--color-border-dim)] rounded-[var(--radius-md)] animate-pulse" />
          <div className="h-10 w-48 bg-[var(--bg-elevated)] border border-[var(--color-border-dim)] rounded-[var(--radius-md)] animate-pulse" />
        </div>
        <div className="h-9 w-64 bg-[var(--bg-elevated)] border border-[var(--color-border-dim)] rounded-[var(--radius-md)] animate-pulse" />
      </div>

      {/* Cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="bg-[var(--bg-elevated)] border border-[var(--color-border-dim)] rounded-[var(--radius-lg)] overflow-hidden">
            <div className="h-32 bg-[var(--bg-panel)] animate-pulse" />
            <div className="p-4 space-y-3">
              <div className="flex gap-1.5">
                <div className="h-5 w-12 bg-[var(--bg-panel)] rounded animate-pulse" />
                <div className="h-5 w-16 bg-[var(--bg-panel)] rounded animate-pulse" />
              </div>
              <div>
                <div className="h-4 w-full bg-[var(--bg-panel)] rounded animate-pulse mb-1.5" />
                <div className="h-1.5 w-full bg-[var(--bg-panel)] rounded-full animate-pulse" />
              </div>
              <div className="h-4 w-24 bg-[var(--bg-panel)] rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
