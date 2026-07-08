import { BarChart3, TrendingUp, Activity } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { Cluster, XPost } from '../lib/types'
import {
  computeThemeFrequency,
  computeSentimentHistogram,
  getRisingClusters,
  computeFeedStats,
} from '../lib/analytics'
import { Panel, HudLabel, StatPill, GlowDivider } from './ui'
import { RisingClustersEmpty } from './empty/EmptyStates'

interface AnalyticsSidebarProps {
  posts: XPost[]
  clusters: Cluster[]
  onSelectCluster?: (name: string) => void
  onSyncReal?: () => void
}

const THEME_COLORS = ['#e6002e', '#00e5ff', '#00ff88', '#ff6b35', '#a855f7', '#fbbf24', '#64748b']
const SENTIMENT_COLORS = ['#ef4444', '#f97316', '#64748b', '#22c55e', '#00ff88']

export function AnalyticsSidebar({ posts, clusters, onSelectCluster, onSyncReal }: AnalyticsSidebarProps) {
  const themes = computeThemeFrequency(clusters)
  const histogram = computeSentimentHistogram(posts)
  const rising = getRisingClusters(clusters)
  const stats = computeFeedStats(posts, clusters)

  return (
    <Panel glow className="space-y-4">
      <div className="flex items-center justify-between">
        <HudLabel className="flex items-center gap-2 text-xs tracking-[2px]">
          <BarChart3 size={14} /> Analytics
        </HudLabel>
        <HudLabel className="text-[10px] text-[var(--muted)]">
          {stats.postCount} posts · {stats.clusterCount} themes
        </HudLabel>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatPill
          label="Avg sent"
          value={`${stats.avgSentiment > 0 ? '+' : ''}${stats.avgSentiment}`}
          variant={stats.avgSentiment >= 0 ? 'positive' : 'negative'}
        />
        <StatPill label="Positive" value={`${stats.positivePct}%`} variant="cyan" />
        <StatPill label="Hot" value={stats.hotClusters} variant="accent" />
      </div>

      <GlowDivider />

      <div>
        <div className="mb-2 flex items-center gap-1 text-xs text-[var(--muted)]">
          <Activity size={12} /> Theme distribution
        </div>
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={themes.slice(0, 6)} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={88}
                tick={{ fill: '#88889a', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                tickFormatter={(v: string) => (v.length > 12 ? v.slice(0, 11) + '…' : v)}
              />
              <Tooltip
                contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
                formatter={(value, _name, item) => {
                  const pct = (item?.payload as { pct?: number })?.pct ?? 0
                  return [`${value ?? 0} posts (${pct}%)`, 'Volume']
                }}
              />
              <Bar dataKey="volume" radius={[0, 4, 4, 0]} barSize={14}>
                {themes.slice(0, 6).map((_, i) => (
                  <Cell key={i} fill={THEME_COLORS[i % THEME_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <GlowDivider />

      <div>
        <HudLabel className="mb-2 block text-[10px]">Sentiment histogram</HudLabel>
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogram} margin={{ left: -20, right: 4, top: 4, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: '#88889a', fontSize: 9, fontFamily: 'JetBrains Mono' }} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8, fontSize: 12 }}
                formatter={(value, _name, item) => {
                  const payload = item?.payload as { pct?: number; range?: string } | undefined
                  return [`${value ?? 0} posts (${payload?.pct ?? 0}%) · ${payload?.range ?? ''}`, 'Count']
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={18}>
                {histogram.map((_, i) => (
                  <Cell key={i} fill={SENTIMENT_COLORS[i % SENTIMENT_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <GlowDivider />

      <div>
        <div className="mb-2 flex items-center gap-1 text-xs text-[var(--muted)]">
          <TrendingUp size={12} /> Rising clusters
        </div>
        <div className="space-y-1.5">
          {rising.length === 0 ? (
            <RisingClustersEmpty onSyncReal={onSyncReal} />
          ) : (
            rising.map(r => (
              <button
                key={r.name}
                type="button"
                onClick={() => onSelectCluster?.(r.name)}
                className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--panel)] px-2.5 py-2 text-left transition-colors hover:border-[var(--border-glow)]"
              >
                <div className="flex items-center justify-between">
                  <span className="truncate pr-2 text-xs font-medium">{r.name}</span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                      r.momentum === 'hot'
                        ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                        : r.momentum === 'warm'
                          ? 'bg-[var(--cyan)]/15 text-[var(--cyan)]'
                          : 'bg-[var(--border)] text-[var(--muted)]'
                    }`}
                  >
                    {r.momentum === 'hot' ? '🔥' : r.momentum === 'warm' ? '↑' : '—'} {r.shift > 0 ? '+' : ''}
                    {r.shift.toFixed(1)}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] text-[var(--muted)]">
                  {r.volume} posts · sent {r.avgSentiment > 0 ? '+' : ''}
                  {r.avgSentiment.toFixed(2)}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </Panel>
  )
}
