import { Search, Zap } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { XPost, SavedRadar } from '../lib/types'
import { HudLabel, NeoButton, Panel } from './ui'
import { cardVariants, pageVariants, postEnterVariants } from './motion'
import { RadarEmptyState } from './empty/EmptyStates'
import { RadarManager } from './RadarManager'

interface FeedPanelProps {
  posts: XPost[]
  filteredPosts: XPost[]
  feedSearch: string
  isRunning: boolean
  radars: SavedRadar[]
  maxRadars: number
  defaultQueries: string[]
  syncingRadarId: string | null
  onFeedSearchChange: (value: string) => void
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
  radars,
  maxRadars,
  defaultQueries,
  syncingRadarId,
  onFeedSearchChange,
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
          <div className="mt-1 text-sm text-[var(--muted)]">
            {posts.length} posts · {isRunning ? 'ingesting' : 'paused'}
          </div>
        </div>
        <NeoButton onClick={onForceIngest} size="xs" aria-label="Force ingest mock post">
          <Zap size={14} aria-hidden /> Force
        </NeoButton>
      </div>

      <div className="mb-3 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            value={feedSearch}
            onChange={(e) => onFeedSearchChange(e.target.value)}
            placeholder="Filter feed (text or @user)..."
            aria-label="Filter feed by text or username"
            className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--panel)] py-2 pl-9 pr-3 text-sm backdrop-blur-sm placeholder:text-[var(--muted)] focus:border-[var(--cyan)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
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
    </div>
  )
}
