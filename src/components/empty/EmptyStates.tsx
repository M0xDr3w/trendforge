import { NeoButton } from '../ui'

export function RadarEmptyState({ filtered }: { filtered?: boolean }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--panel)]/50 px-6 py-14 text-center"
      role="status"
    >
      <div className="relative mb-5 h-24 w-24" aria-hidden>
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(0,229,255,0.12)" strokeWidth="1" />
          <circle cx="50" cy="50" r="28" fill="none" stroke="rgba(0,229,255,0.18)" strokeWidth="1" />
          <circle cx="50" cy="50" r="12" fill="none" stroke="rgba(230,0,46,0.25)" strokeWidth="1" />
          <line x1="50" y1="50" x2="50" y2="8" stroke="rgba(0,229,255,0.35)" strokeWidth="1" />
          <g className="radar-sweep origin-center">
            <path d="M50 50 L50 6 A44 44 0 0 1 94 50 Z" fill="url(#radarGradient)" opacity="0.55" />
          </g>
          <defs>
            <radialGradient id="radarGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(230,0,46,0)" />
              <stop offset="100%" stopColor="rgba(230,0,46,0.35)" />
            </radialGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="h-2 w-2 rounded-full bg-[var(--accent)] shadow-[0_0_12px_var(--accent)]" />
        </div>
      </div>
      <p className="font-display text-sm font-medium text-[var(--text)]">
        {filtered ? 'No posts match this filter' : 'Awaiting signals…'}
      </p>
      <p className="mt-1 max-w-[220px] text-xs text-[var(--muted)]">
        {filtered
          ? 'Clear the search box or sync a broader X query.'
          : 'Mock ingest is running, or sync real posts from X.'}
      </p>
    </div>
  )
}

export function ChartSkeleton() {
  return (
    <div className="flex h-full flex-col justify-end gap-3 px-2 py-4" role="status" aria-label="Collecting chart data">
      <div className="flex items-end justify-between gap-2 h-40">
        {[42, 68, 55, 82, 48, 74, 60].map((h, i) => (
          <div
            key={i}
            className="shimmer flex-1 rounded-t-md bg-[var(--border)]"
            style={{ height: `${h}%`, animationDelay: `${i * 0.08}s` }}
          />
        ))}
      </div>
      <p className="text-center text-xs text-[var(--muted)]">Collecting volume samples…</p>
    </div>
  )
}

interface RisingClustersEmptyProps {
  onSyncReal?: () => void
}

export function RisingClustersEmpty({ onSyncReal }: RisingClustersEmptyProps) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] bg-[var(--panel)]/40 px-3 py-4 text-center">
      <p className="text-xs text-[var(--muted)]">Collecting velocity data…</p>
      <p className="mt-1 text-[10px] leading-relaxed text-[var(--muted)]">
        Need more samples, or pull fresh signals from X.
      </p>
      {onSyncReal && (
        <NeoButton onClick={onSyncReal} variant="accent" size="xs" className="mt-3" aria-label="Sync real posts from X">
          Sync real X
        </NeoButton>
      )}
    </div>
  )
}
