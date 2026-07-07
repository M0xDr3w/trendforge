import { BarChart3, TrendingUp, Activity } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { Cluster, XPost } from '../lib/types'
import {
  computeThemeFrequency,
  computeSentimentHistogram,
  getRisingClusters,
  computeFeedStats,
} from '../lib/analytics'

interface AnalyticsSidebarProps {
  posts: XPost[]
  clusters: Cluster[]
  onSelectCluster?: (name: string) => void
}

const THEME_COLORS = ['#e6002e', '#00e5ff', '#00ff88', '#ff6b35', '#a855f7', '#fbbf24', '#64748b']
const SENTIMENT_COLORS = ['#ef4444', '#f97316', '#64748b', '#22c55e', '#00ff88']

export function AnalyticsSidebar({ posts, clusters, onSelectCluster }: AnalyticsSidebarProps) {
  const themes = computeThemeFrequency(clusters)
  const histogram = computeSentimentHistogram(posts)
  const rising = getRisingClusters(clusters)
  const stats = computeFeedStats(posts, clusters)

  return (
    <div className="bg-[#0a0a0f] border border-[#22222a] rounded-3xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="hud text-xs tracking-[2px] text-[#666] flex items-center gap-2">
          <BarChart3 size={14} /> ANALYTICS
        </div>
        <div className="text-[10px] text-[#555] hud">{stats.postCount} posts · {stats.clusterCount} themes</div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-[#111] border border-[#222] rounded-xl p-2">
          <div className="text-[10px] text-[#666] hud">AVG SENT</div>
          <div className={`text-sm font-semibold ${stats.avgSentiment >= 0 ? 'text-[#00ff88]' : 'text-red-400'}`}>
            {stats.avgSentiment > 0 ? '+' : ''}{stats.avgSentiment}
          </div>
        </div>
        <div className="bg-[#111] border border-[#222] rounded-xl p-2">
          <div className="text-[10px] text-[#666] hud">POSITIVE</div>
          <div className="text-sm font-semibold text-[#00e5ff]">{stats.positivePct}%</div>
        </div>
        <div className="bg-[#111] border border-[#222] rounded-xl p-2">
          <div className="text-[10px] text-[#666] hud">HOT</div>
          <div className="text-sm font-semibold text-[#e6002e]">{stats.hotClusters}</div>
        </div>
      </div>

      <div>
        <div className="text-xs text-[#888] mb-2 flex items-center gap-1">
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
                tick={{ fill: '#888', fontSize: 10 }}
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

      <div>
        <div className="text-xs text-[#888] mb-2">Sentiment histogram</div>
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogram} margin={{ left: -20, right: 4, top: 4, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fill: '#666', fontSize: 9 }} />
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

      <div>
        <div className="text-xs text-[#888] mb-2 flex items-center gap-1">
          <TrendingUp size={12} /> Rising clusters
        </div>
        <div className="space-y-1.5">
          {rising.length === 0 ? (
            <div className="text-xs text-[#555] py-2">Collecting velocity data…</div>
          ) : (
            rising.map(r => (
              <button
                key={r.name}
                type="button"
                onClick={() => onSelectCluster?.(r.name)}
                className="w-full text-left bg-[#111] border border-[#222] rounded-lg px-2.5 py-2 hover:border-[#e6002e]/50 transition-colors"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium truncate pr-2">{r.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                      r.momentum === 'hot'
                        ? 'bg-[#e6002e]/20 text-[#e6002e]'
                        : r.momentum === 'warm'
                          ? 'bg-[#00e5ff]/15 text-[#00e5ff]'
                          : 'bg-[#222] text-[#888]'
                    }`}
                  >
                    {r.momentum === 'hot' ? '🔥' : r.momentum === 'warm' ? '↑' : '—'} {r.shift > 0 ? '+' : ''}{r.shift.toFixed(1)}
                  </span>
                </div>
                <div className="text-[10px] text-[#666] mt-0.5">
                  {r.volume} posts · sent {r.avgSentiment > 0 ? '+' : ''}{r.avgSentiment.toFixed(2)}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}