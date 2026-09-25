import { Search, Zap } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { XPost, SavedRadar } from '../lib/types'
import { HudLabel, NeoButton, Panel, FieldInput } from './ui'
import { cardVariants, pageVariants, postEnterVariants } from './motion'
import { RadarEmptyState } from './empty/EmptyStates'
import { RadarManager } from './RadarManager'

interface FeedPanelProps {
  posts: XPost[]
  filteredPosts: XPost[]
  feedSearch: string
  isRunning: boolean
  /** True while the feed shows locally generated sample posts (not real X data). */
  isSample: boolean
  appToken: string
  radars: SavedRadar[]
  maxRadars: number
  defaultQueries: string[]
  syncingRadarId: string | null
  onFeedSearchChange: (value: string) => void
  onAppTokenChange: (value: string) => void
  onForceIngest: () => void
  onSyncReal: () => void
  onTestConnection: () => void
  onAddRadar: (name: string, query: string) => void
  onDeleteRadar: (id: string) => void
  onSyncRadar: (radar: SavedRadar) => void
  onSyncAllRadars: () => void
}

function avatarInitial(username: string): string {
  return (username.replace('@', '')[0] || '?').toUpperCase()
}

export function FeedPanel({
  posts,
  filteredPosts,
  feedSearch,
  isRunning,
  isSample,
  appToken,
  radars,
  maxRadars,
  defaultQueries,
  syncingRadarId,
  onFeedSearchChange,
  onAppTokenChange,
  onForceIngest,
  onSyncReal,
  onTestConnection,
  onAddRadar,
  onDeleteRadar,
  onSyncRadar,
  onSyncAllRadars,
}: FeedPanelProps) {
  const reduceMotion = useReducedMotion()
  const visiblePosts = filteredPosts.slice(0, 12)
  const isFiltered = feedSearch.trim().length > 0

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <HudLabel className="block text-xs tracking-[0.15em]">Live X feed</HudLabel>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
            <span>
              {posts.length} posts · {isRunning ? 'ingesting' : 'paused'}
            </span>
            {isSample && (
              <span
                className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-amber-300"
                title="Sample posts use fictional @sample_* accounts with invented counts — not real X data"
              >
                SAMPLE DATA · FICTIONAL ACCOUNTS
              </span>
            )}
          </div>
        </div>
        <NeoButton onClick={onForceIngest} size="xs" aria-label="Force ingest mock post">
          <Zap size={14} aria-hidden /> Force
        </NeoButton>
      </div>

      <div className="mb-3 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <FieldInput
            value={feedSearch}
            onChange={(e) => onFeedSearchChange(e.target.value)}
            placeholder="Filter feed (text or @user)..."
            aria-label="Filter feed by text or username"
            className="rounded-[var(--radius-md)] py-2 pl-9 pr-3 backdrop-blur-sm"
          />
          <Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-[var(--muted)]" aria-hidden />
        </div>
        <NeoButton
          onClick={onSyncReal}
          variant="accent"
          size="xs"
          className="hidden shrink-0 lg:inline-flex"
          aria-label="Sync real posts from X"
        >
          <Search size={14} aria-hidden /> Sync real X
        </NeoButton>
        <NeoButton
          onClick={onTestConnection}
          size="xs"
          className="shrink-0"
          title="Test the Vercel proxy + token"
          aria-label="Test X API proxy connection"
        >
          Test
        </NeoButton>
      </div>

      {visiblePosts.length === 0 ? (
        <RadarEmptyState filtered={isFiltered} />
      ) : (
        <motion.div
          className="max-h-[520px] space-y-2 overflow-auto pr-1"
          initial="hidden"
          animate="visible"
          variants={pageVariants}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {visiblePosts.map((post) => (
              <motion.div
                key={post.id}
                layout={!reduceMotion}
                variants={reduceMotion ? cardVariants : postEnterVariants}
                initial={reduceMotion ? 'hidden' : 'initial'}
                animate={reduceMotion ? 'visible' : 'animate'}
                exit="exit"
              >
                <Panel padding="sm" className="post text-sm">
                  <div className="flex gap-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-gradient-to-br from-[var(--panel)] to-[var(--bg)] text-xs font-semibold text-[var(--cyan)]"
                      aria-hidden
                    >
                      {avatarInitial(post.username)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex justify-between gap-2 text-xs text-[var(--muted)]">
                        <span className="truncate font-medium text-[var(--text)]">@{post.username}</span>
                        <span className="shrink-0">
                          {new Date(post.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="mb-2 text-[15px] leading-snug text-[var(--text)]">{post.text}</p>
                      <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)]">
                        <span>♥ {post.likes.toLocaleString()}</span>
                        <span>↻ {post.retweets}</span>
                        <span className={post.sentiment > 0 ? 'text-[var(--green)]' : 'text-red-400'}>
                          sentiment {post.sentiment.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                </Panel>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <RadarManager
        radars={radars}
        maxRadars={maxRadars}
        defaultQueries={defaultQueries}
        syncingId={syncingRadarId}
        onAdd={onAddRadar}
        onDelete={onDeleteRadar}
        onSync={onSyncRadar}
        onSyncAll={onSyncAllRadars}
      />

      <details className="mt-3 rounded-[var(--radius-sm)] border border-[var(--border)] px-2.5 py-2">
        <summary className="cursor-pointer text-[11px] text-[var(--muted)] hover:text-[var(--text)]">
          Owner access token (only if APP_ACCESS_TOKEN is set on the server)
        </summary>
        <FieldInput
          value={appToken}
          onChange={(e) => onAppTokenChange(e.target.value)}
          type="password"
          autoComplete="off"
          placeholder="Paste access token — session only, never stored"
          aria-label="Owner access token for API proxies"
          className="mt-2 text-xs"
        />
        <p className="mt-1 text-[10px] leading-snug text-[var(--muted)]">
          Sent as <span className="text-[var(--text)]">x-app-token</span> with proxy calls. Kept in
          sessionStorage only; leave empty unless the deployment requires it.
        </p>
      </details>
    </div>
  )
}
