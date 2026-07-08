import { LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import type { Cluster } from '../lib/types'
import { HudLabel, Panel } from './ui'
import { cardVariants, clusterBorderStyle, pageVariants, CLUSTER_SELECT_LAYOUT_ID } from './motion'

interface ClusterPanelProps {
  clusters: Cluster[]
  selectedClusterId: string | null
  onSelectCluster: (cluster: Cluster) => void
}

export function ClusterPanel({ clusters, selectedClusterId, onSelectCluster }: ClusterPanelProps) {
  const reduceMotion = useReducedMotion()

  return (
    <div>
      <HudLabel className="mb-3 block text-xs tracking-[0.15em]">Current clusters</HudLabel>
      <LayoutGroup id="clusters">
        <motion.div className="space-y-3" initial="hidden" animate="visible" variants={pageVariants}>
          {clusters.map((cluster) => {
            const isSelected = selectedClusterId === cluster.id
            return (
              <motion.div key={cluster.id} variants={cardVariants} layout={!reduceMotion}>
                <Panel
                  padding="sm"
                  glow={isSelected}
                  onClick={() => onSelectCluster(cluster)}
                  style={clusterBorderStyle(cluster.shift)}
                  className={`cluster-card relative cursor-pointer overflow-hidden border-l-[3px] ${isSelected ? '' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  aria-label={`Select cluster ${cluster.name}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelectCluster(cluster)
                    }
                  }}
                >
                  {isSelected && (
                    <motion.span
                      layoutId={CLUSTER_SELECT_LAYOUT_ID}
                      className="pointer-events-none absolute inset-0 rounded-[var(--radius-lg)] ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--bg)]"
                      transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 32 }}
                    />
                  )}
                  <div className="relative flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <motion.div
                        className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--accent)]"
                        animate={
                          reduceMotion
                            ? { scale: 1 }
                            : { scale: [1, 1 + Math.min(0.8, cluster.volume / 8), 1] }
                        }
                        transition={reduceMotion ? undefined : { duration: 1.2, repeat: Infinity }}
                      />
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{cluster.name}</div>
                        <div className="text-xs text-[var(--muted)]">
                          {cluster.posts.length} posts · vol {cluster.volume}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`relative shrink-0 rounded px-2 py-0.5 text-xs ${
                        cluster.shift > 0.3
                          ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                          : cluster.shift < -0.3
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'bg-[var(--border)] text-[var(--muted)]'
                      }`}
                    >
                      shift {cluster.shift > 0 ? '+' : ''}
                      {cluster.shift.toFixed(1)}
                    </span>
                  </div>
                  <div className="relative mt-2 line-clamp-2 text-xs text-[var(--muted)]">
                    {cluster.posts[0]?.text.substring(0, 110)}...
                  </div>
                </Panel>
              </motion.div>
            )
          })}
        </motion.div>
      </LayoutGroup>
    </div>
  )
}
