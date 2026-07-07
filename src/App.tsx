import { useState, useEffect, useCallback } from 'react'
import { Play, Pause, RefreshCw, Zap, Target, Lightbulb, Sparkles, Search } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { config } from './lib/config'
import { computeClusters, buildVolumeSnapshot } from './lib/clusters'
import { detectInsights, forgeContent } from './lib/narrative'
import { generateSparks } from './lib/insights'
import { seedPosts, generateMockPost, fetchRealPosts, mergePosts } from './lib/feed'
import { AnalyticsSidebar } from './components/AnalyticsSidebar'
import type { XPost, Cluster } from './lib/types'

function App() {
  const [posts, setPosts] = useState<XPost[]>(() => {
    try {
      const saved = localStorage.getItem('trendforge-posts')
      if (saved) return JSON.parse(saved)
    } catch {}
    return seedPosts()
  })
  const [isRunning, setIsRunning] = useState(true)
  const [history, setHistory] = useState<Record<string, number>[]>([])
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null)
  const [customTopic, setCustomTopic] = useState('')
  const [feedSearch, setFeedSearch] = useState('')
  const [liveReal, setLiveReal] = useState(false)

  const clusters = computeClusters(posts, history)
  const previousVolumes = history.length > 0 ? history[history.length - 1] : {}
  const insights = detectInsights(clusters, previousVolumes)
  const sparks = selectedCluster
    ? generateSparks({ name: selectedCluster.name, category: selectedCluster.name })
    : []

  useEffect(() => {
    setHistory(h => [...h.slice(-8), buildVolumeSnapshot(posts)])
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [posts.length])

  useEffect(() => {
    try {
      localStorage.setItem('trendforge-posts', JSON.stringify(posts))
    } catch {}
  }, [posts])

  useEffect(() => {
    if (!liveReal) return
    const id = setInterval(async () => {
      const fresh = await fetchRealPosts(config.liveRealQuery)
      if (fresh.length > 0) {
        setPosts(prev => mergePosts(prev, fresh))
      }
    }, config.liveRealPollMs)
    toast.info(`Live Real X polling enabled (every ~${config.liveRealPollMs / 1000}s)`)
    return () => clearInterval(id)
  }, [liveReal])

  useEffect(() => {
    if (!isRunning) return
    const interval = setInterval(() => {
      setPosts(prev => [generateMockPost(Date.now()), ...prev].slice(0, config.maxPosts))
    }, config.mockFeedIntervalMs)
    return () => clearInterval(interval)
  }, [isRunning])

  const toggleFeed = () => setIsRunning(!isRunning)

  const reset = () => {
    localStorage.removeItem('trendforge-posts')
    setPosts(seedPosts())
    setHistory([])
    setSelectedCluster(null)
    setCustomTopic('')
    toast.success('Feed reset')
  }

  const addCustomPost = () => {
    const text = prompt('Enter post text:')
    if (!text) return
    const newPost: XPost = {
      id: Date.now(),
      text,
      username: 'you',
      timestamp: new Date().toISOString(),
      likes: 120 + Math.floor(Math.random() * 200),
      retweets: 20 + Math.floor(Math.random() * 50),
      sentiment: (Math.random() - 0.5) * 1.6,
    }
    setPosts(prev => [newPost, ...prev].slice(0, config.maxPosts))
    toast.info('Post injected')
  }

  const forge = useCallback(() => {
    const ideas = forgeContent(selectedCluster, customTopic || undefined)
    const currentSparks = selectedCluster
      ? generateSparks({ name: selectedCluster.name, category: selectedCluster.name })
      : []
    const sparkNote = currentSparks.length > 0 ? `\n\nSpark: ${currentSparks[0]}` : ''
    navigator.clipboard?.writeText(ideas.join('\n\n') + sparkNote).catch(() => {})
    toast.success('Content forged', { description: ideas[0].slice(0, 75) + '...' })
  }, [selectedCluster, customTopic])

  const analyzeWithGrok = () => {
    if (!selectedCluster) {
      toast.info('Select a cluster first')
      return
    }
    const summary = `Cluster: ${selectedCluster.name}\nVolume: ${selectedCluster.volume}\nSentiment: ${selectedCluster.avgSentiment.toFixed(2)}\nShift: ${selectedCluster.shift.toFixed(2)}\nPosts sample:\n${selectedCluster.posts.slice(0, 3).map(p => `- ${p.text}`).join('\n')}`
    const prompt = `You have the xapi MCP server available (@xdevplatform/xurl mcp).

Using xapi MCP tools, analyze this X cluster and suggest 3 unique, timely content angles or hooks. Be specific and reference real signals if possible.

Cluster data:
${summary}`
    navigator.clipboard?.writeText(prompt).catch(() => {})
    toast.success('Prompt copied for Grok + xapi MCP', {
      description: 'MCP not connected? Run: bash scripts/setup-xapi-mcp.sh',
      duration: 5000,
    })
  }

  const exportState = () => {
    const data = {
      timestamp: new Date().toISOString(),
      clusters: clusters.map(c => ({ name: c.name, volume: c.volume, sentiment: c.avgSentiment, shift: c.shift, posts: c.posts.length })),
      insights,
      sparks,
      selected: selectedCluster?.name || null,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trendforge-export-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported current state as JSON')
  }

  const exportMarkdownThread = () => {
    const topic = selectedCluster?.name || customTopic || 'emerging signal'
    const vol = selectedCluster?.volume || posts.length
    const sent = selectedCluster ? selectedCluster.avgSentiment.toFixed(2) : '0.00'
    const shift = selectedCluster ? selectedCluster.shift.toFixed(2) : '0.00'
    const ideas = forgeContent(selectedCluster, customTopic || undefined)
    const currentSparks = selectedCluster
      ? generateSparks({ name: selectedCluster.name, category: selectedCluster.name })
      : []

    const md = `# ${topic} — TrendForge Thread

**Generated:** ${new Date().toISOString()}
**Cluster volume:** ${vol} | **Avg sentiment:** ${sent} | **Shift:** ${shift}
**Source:** TrendForge real-time X radar

## Key Signals
${selectedCluster?.posts.slice(0, 3).map(p => `- ${p.text} (@${p.username})`).join('\n') || '- Live feed analysis'}

## Forged Angles
${ideas.map((i, idx) => `${idx + 1}. ${i}`).join('\n\n')}

## Sparks / Next Experiments
${currentSparks.map(s => `- ${s}`).join('\n') || '- Run a 48h micro-experiment'}

## Action
${insights[0]?.action || 'Ship the contrarian or gap angle now.'}

---
Exported from TrendForge. Pair with ForgeRouter for private LLM refinement.
`

    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trendforge-thread-${topic.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(url)

    const sidecar = {
      topic,
      volume: vol,
      sentiment: sent,
      shift,
      forged: ideas,
      sparks: currentSparks,
      timestamp: new Date().toISOString(),
    }
    const sblob = new Blob([JSON.stringify(sidecar, null, 2)], { type: 'application/json' })
    const su = URL.createObjectURL(sblob)
    const sa = document.createElement('a')
    sa.href = su
    sa.download = `trendforge-meta-${Date.now()}.json`
    sa.click()
    URL.revokeObjectURL(su)

    toast.success('Markdown thread + JSON sidecar downloaded', { description: 'Ready to post or pipe to other Forges' })
  }

  const logToMakerlog = () => {
    const title = `TrendForge session: ${selectedCluster?.name || 'multi-cluster'}`
    const notes = `Clustered ${clusters.length} signals. Key insight: ${insights[0]?.title || 'N/A'}. Forged angles for ${selectedCluster?.name || 'global'}.`
    navigator.clipboard?.writeText(`Category: Code & Software
Title: ${title}
Notes: ${notes}
Hours: 0.5
Tags: trendforge,signals,forge`).catch(() => {})
    toast.info('MakerLog entry copied', { description: 'Paste into makerlog or run insert' })
  }

  const syncReal = async () => {
    const q = prompt('X search query:', config.defaultSyncQuery)
    if (!q) return
    const realPosts = await fetchRealPosts(q)
    if (realPosts.length > 0) {
      setPosts(prev => mergePosts(prev, realPosts))
      setFeedSearch('')
      toast.success(`Synced ${realPosts.length} real posts from X (merged)`)
    }
  }

  const testRealConnection = async () => {
    toast.info('Testing /api/x-search proxy...')
    const testPosts = await fetchRealPosts('AI')
    if (testPosts.length > 0) {
      toast.success(`Proxy OK — got ${testPosts.length} real posts. First: ${testPosts[0].text.slice(0, 60)}...`)
    } else {
      toast.error('Proxy test failed. Run the auth steps in README + .env.example, set X_BEARER_TOKEN, then retry (or use vercel dev).')
    }
  }

  const chartData = history.slice(-7).map((vols, idx) => {
    const entry: Record<string, number> = { t: idx }
    Object.keys(vols).forEach(k => { entry[k] = vols[k] })
    return entry
  })

  const topClusters = clusters.slice(0, 5)
  const filteredPosts = posts.filter(
    p =>
      !feedSearch ||
      p.text.toLowerCase().includes(feedSearch.toLowerCase()) ||
      p.username.toLowerCase().includes(feedSearch.toLowerCase()),
  )

  return (
    <div className="min-h-screen bg-black text-[#f0f0f5] p-6 font-sans">
      <div className="max-w-[1280px] mx-auto">
        <div className="flex items-end justify-between mb-8 border-b border-[#22222a] pb-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-[52px] font-semibold tracking-[-3.5px] text-[#e6002e]">TRENDFORGE</span>
              <span className="hud text-sm text-[#666] tracking-[3px]">REAL-TIME X CONTENT ENGINE</span>
              <motion.div
                className="w-2 h-2 rounded-full bg-[#e6002e] mt-1"
                animate={{ scale: [1, 1.8, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.6, repeat: Infinity }}
              />
            </div>
            <p className="text-[#888] mt-1">Detect shifts. Find gaps. Forge unique angles before the crowd. <span className="text-[#e6002e] text-xs">+ REAL X MCP</span></p>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button onClick={toggleFeed} className={`neo-btn px-4 py-2 rounded flex items-center gap-2 ${isRunning ? 'active' : ''}`}>
              {isRunning ? <Pause size={16} /> : <Play size={16} />} {isRunning ? 'PAUSE FEED' : 'START REAL-TIME'}
            </button>
            <button onClick={reset} className="neo-btn px-4 py-2 rounded flex items-center gap-2"><RefreshCw size={16} /> RESET</button>
            <button onClick={addCustomPost} className="neo-btn px-4 py-2 rounded">+ INJECT POST</button>
            <button
              onClick={() => setLiveReal(!liveReal)}
              className={`neo-btn px-3 py-2 rounded text-xs ${liveReal ? 'active' : ''}`}
              title="Periodically pull fresh posts from the Vercel X proxy"
            >
              {liveReal ? '⏹ LIVE REAL' : '▶ LIVE REAL'}
            </button>
            <button onClick={exportState} className="neo-btn px-3 py-2 rounded text-xs">EXPORT JSON</button>
            <button onClick={exportMarkdownThread} className="neo-btn px-3 py-2 rounded text-xs bg-[#e6002e]/10">DOWNLOAD THREAD (MD + JSON)</button>
            <button onClick={logToMakerlog} className="neo-btn px-3 py-2 rounded text-xs">LOG TO MAKERLOG</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="hud text-xs tracking-[2px] text-[#666]">LIVE X FEED</div>
                <div className="text-sm text-[#888]">{posts.length} posts • {isRunning ? 'ingesting' : 'paused'}</div>
              </div>
              <button onClick={() => setPosts(p => [generateMockPost(Date.now()), ...p].slice(0, config.maxPosts))} className="neo-btn px-3 py-1 text-xs rounded flex items-center gap-1"><Zap size={14}/> FORCE INGEST</button>
            </div>

            <div className="mb-3 flex gap-2">
              <div className="relative flex-1">
                <input
                  value={feedSearch}
                  onChange={(e) => setFeedSearch(e.target.value)}
                  placeholder="Filter feed (text or @user)..."
                  className="w-full bg-[#0a0a0f] border border-[#22222a] rounded-xl pl-9 py-2 text-sm placeholder:text-[#555] focus:outline-none focus:border-[#333]"
                />
                <Search size={15} className="absolute left-3 top-2.5 text-[#666]" />
              </div>
              <button onClick={syncReal} className="neo-btn px-3 py-1 text-xs rounded flex items-center gap-1 bg-[#e6002e] text-white"><Search size={14}/> SYNC REAL X</button>
              <button onClick={testRealConnection} className="neo-btn px-2 py-1 text-xs rounded" title="Test the Vercel proxy + token">TEST</button>
            </div>

            <div className="space-y-2 max-h-[520px] overflow-auto pr-2">
              {filteredPosts.slice(0, 12).map((post) => (
                <div key={post.id} className="post bg-[#0a0a0f] border border-[#22222a] rounded-2xl p-4 text-sm">
                  <div className="flex justify-between text-xs text-[#888] mb-1.5">
                    <span>@{post.username}</span>
                    <span>{new Date(post.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="leading-snug mb-2">{post.text}</div>
                  <div className="flex gap-3 text-xs text-[#666]">
                    <span>♥ {post.likes.toLocaleString()}</span>
                    <span>↻ {post.retweets}</span>
                    <span className={post.sentiment > 0 ? 'text-[#00ff88]' : 'text-red-400'}>
                      sentiment {post.sentiment.toFixed(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-4">
            <div className="hud text-xs tracking-[2px] text-[#666] mb-3">CURRENT CLUSTERS</div>
            <div className="space-y-3">
              {topClusters.map(cluster => {
                const isSelected = selectedCluster?.id === cluster.id
                return (
                  <div
                    key={cluster.id}
                    onClick={() => setSelectedCluster(cluster)}
                    className={`cluster-card bg-[#0a0a0f] border border-[#22222a] rounded-2xl p-4 cursor-pointer ${isSelected ? 'ring-1 ring-[#e6002e]' : ''}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <motion.div
                          className="w-2.5 h-2.5 rounded-full bg-[#e6002e]"
                          animate={{ scale: [1, 1 + Math.min(0.8, cluster.volume / 8), 1] }}
                          transition={{ duration: 1.2, repeat: Infinity }}
                        />
                        <div>
                          <div className="font-semibold">{cluster.name}</div>
                          <div className="text-xs text-[#888]">{cluster.posts.length} posts • vol {cluster.volume}</div>
                        </div>
                      </div>
                      <div className={`text-xs px-2 py-0.5 rounded ${cluster.shift > 0.3 ? 'bg-[#e6002e]/20 text-[#e6002e]' : cluster.shift < -0.3 ? 'bg-blue-500/20 text-blue-400' : 'bg-[#222]'}`}>
                        shift {cluster.shift > 0 ? '+' : ''}{cluster.shift.toFixed(1)}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-[#666] line-clamp-2">{cluster.posts[0]?.text.substring(0, 110)}...</div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="lg:col-span-3 space-y-4">
            <AnalyticsSidebar
              posts={posts}
              clusters={clusters}
              onSelectCluster={(name) => {
                const match = clusters.find(c => c.name === name)
                if (match) setSelectedCluster(match)
              }}
            />

            <div className="hud text-xs tracking-[2px] text-[#666] mb-3">INSIGHTS &amp; GAPS</div>
            <div className="space-y-2 mb-6">
              {insights.map((ins, idx) => (
                <div key={idx} className="alert bg-[#0a0a0f] border border-[#22222a] p-3 rounded-2xl text-sm">
                  <div className="font-medium text-xs tracking-widest mb-0.5 text-[#e6002e]">{ins.type.toUpperCase()}</div>
                  <div className="font-semibold mb-1">{ins.title}</div>
                  <div className="text-xs text-[#888] mb-1.5">{ins.detail}</div>
                  <div className="text-xs text-[#00ff88]">→ {ins.action}</div>
                </div>
              ))}
            </div>

            <div className="bg-[#0a0a0f] border border-[#22222a] rounded-3xl p-4">
              <div className="hud text-xs tracking-[2px] text-[#666] mb-2 flex items-center gap-2"><Target size={14} /> CONTENT FORGE</div>
              <div className="text-sm mb-2">Selected: <span className="text-[#e6002e]">{selectedCluster?.name || 'Global'}</span></div>
              <input
                value={customTopic}
                onChange={e => setCustomTopic(e.target.value)}
                placeholder="Custom topic..."
                className="w-full bg-black border border-[#22222a] px-3 py-2 rounded text-sm mb-3"
              />
              <button onClick={forge} className="neo-btn primary w-full py-2.5 rounded-xl flex items-center justify-center gap-2 text-sm">
                <Lightbulb size={16} /> FORGE UNIQUE ANGLES
              </button>
              <button onClick={analyzeWithGrok} disabled={!selectedCluster} className="w-full py-1.5 text-xs rounded border border-[#333] flex items-center justify-center gap-1 mt-2 disabled:opacity-50">
                ASK GROK + X MCP
              </button>
              <div className="text-[10px] text-[#666] mt-2 text-center">First idea copied to clipboard</div>

              {sparks.length > 0 && (
                <div className="mt-4 pt-4 border-t border-[#22222a]">
                  <div className="hud text-xs tracking-[2px] text-[#666] mb-2 flex items-center gap-2"><Sparkles size={14} /> SPARKS (idea starters)</div>
                  <div className="space-y-1.5 mb-3">
                    {sparks.map((s, i) => (
                      <div key={i} className="text-xs bg-[#111] border border-[#222] rounded p-2 leading-snug">{s}</div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(sparks.join('\n\n')).catch(() => {})
                      toast.success('Sparks copied', { description: 'Use these as contrarian angles or experiments' })
                    }}
                    className="neo-btn w-full py-1.5 text-xs rounded flex items-center justify-center gap-1"
                  >
                    COPY SPARKS
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-12 mt-4">
            <div className="hud text-xs tracking-[2px] text-[#666] mb-2">VOLUME OVER TIME</div>
            <div className="bg-[#0a0a0f] border border-[#22222a] rounded-3xl p-4 h-72">
              {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="t" />
                    <YAxis />
                    <Tooltip />
                    {Object.keys(chartData[0] || {}).filter(k => k !== 't').slice(0, 5).map((key, i) => (
                      <Line key={i} type="monotone" dataKey={key} stroke={i % 2 === 0 ? '#e6002e' : '#00e5ff'} strokeWidth={2} dot={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-[#666]">Collecting data for chart...</div>
              )}
            </div>
            <div className="text-center text-xs text-[#555] mt-3 tracking-widest">NARRATIVE ARBITRAGE • LOCAL ANALYSIS • X SIGNALS</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
