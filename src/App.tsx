import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { config } from './lib/config'
import { computeClusters, buildVolumeSnapshot } from './lib/clusters'
import { detectInsights, forgeContent } from './lib/narrative'
import { generateSparks } from './lib/insights'
import { seedPosts, generateMockPost, fetchRealPosts, mergePosts } from './lib/feed'
import { loadRadars, saveRadars, addRadar, deleteRadar, updateRadarLastSynced } from './lib/radars'
import { AnalyticsSidebar } from './components/AnalyticsSidebar'
import { Header } from './components/Header'
import { FeedPanel } from './components/FeedPanel'
import { ClusterPanel } from './components/ClusterPanel'
import { InsightsPanel } from './components/InsightsPanel'
import { ForgePanel } from './components/ForgePanel'
import { VolumeChart } from './components/VolumeChart'
import { MobileActionBar } from './components/MobileActionBar'
import { pageVariants, sectionVariants, type ConnectionStatus } from './components/motion'
import type { XApiConnectionStatus } from './lib/xApiErrors'
import type { XPost, Cluster, SavedRadar } from './lib/types'

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
  const [forgedFlash, setForgedFlash] = useState(false)
  const [xApiStatus, setXApiStatus] = useState<XApiConnectionStatus>('mock')
  const [radars, setRadars] = useState<SavedRadar[]>(() =>
    loadRadars(config.defaultQueries, config.maxRadars),
  )
  const [syncingRadarId, setSyncingRadarId] = useState<string | null>(null)

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
    saveRadars(radars)
  }, [radars])

  useEffect(() => {
    if (!liveReal) return
    const id = setInterval(async () => {
      const { posts: fresh, error } = await fetchRealPosts(config.liveRealQuery, { silent: true })
      if (error) {
        setXApiStatus('error')
        return
      }
      if (fresh.length > 0) {
        setXApiStatus('connected')
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
    setXApiStatus('mock')
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
    setForgedFlash(true)
    window.setTimeout(() => setForgedFlash(false), 900)
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

  const copySparks = () => {
    navigator.clipboard?.writeText(sparks.join('\n\n')).catch(() => {})
    toast.success('Sparks copied', { description: 'Use these as contrarian angles or experiments' })
  }

  const exportState = () => {
    const data = {
      timestamp: new Date().toISOString(),
      radars: radars.map(r => ({
        name: r.name,
        query: r.query,
        createdAt: r.createdAt,
        lastSynced: r.lastSynced ?? null,
      })),
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

  const syncRadar = async (radar: SavedRadar) => {
    setSyncingRadarId(radar.id)
    const { posts: realPosts, error } = await fetchRealPosts(radar.query)
    setSyncingRadarId(null)
    if (error) {
      setXApiStatus('error')
      return
    }
    if (realPosts.length > 0) {
      setXApiStatus('connected')
      setPosts(prev => mergePosts(prev, realPosts))
      setRadars(prev => updateRadarLastSynced(prev, radar.id))
      setFeedSearch('')
      toast.success(`Synced ${realPosts.length} posts for "${radar.name}"`)
    }
  }

  const handleAddRadar = (name: string, query: string) => {
    const { radars: next, error } = addRadar(radars, name, query, config.maxRadars)
    if (error) {
      toast.error(error)
      return
    }
    setRadars(next)
    toast.success(`Saved radar "${name.trim()}"`)
  }

  const handleDeleteRadar = (id: string) => {
    const radar = radars.find(r => r.id === id)
    setRadars(deleteRadar(radars, id))
    toast.info(radar ? `Removed "${radar.name}"` : 'Radar removed')
  }

  const syncReal = async () => {
    const q = prompt('X search query:', config.defaultSyncQuery)
    if (!q) return
    const { posts: realPosts, error } = await fetchRealPosts(q)
    if (error) {
      setXApiStatus('error')
      return
    }
    if (realPosts.length > 0) {
      setXApiStatus('connected')
      setPosts(prev => mergePosts(prev, realPosts))
      setFeedSearch('')
      toast.success(`Synced ${realPosts.length} real posts from X (merged)`)
    }
  }

  const testRealConnection = async () => {
    toast.info('Testing /api/x-search proxy...')
    const { posts: testPosts, error } = await fetchRealPosts('AI')
    if (error) {
      setXApiStatus('error')
      return
    }
    if (testPosts.length > 0) {
      setXApiStatus('connected')
      toast.success(`Proxy OK — got ${testPosts.length} real posts. First: ${testPosts[0].text.slice(0, 60)}...`)
    } else {
      setXApiStatus('error')
      toast.error('Proxy returned no posts', { description: 'Try a different query or check X API access.' })
    }
  }

  const forceIngest = () => {
    setPosts(p => [generateMockPost(Date.now()), ...p].slice(0, config.maxPosts))
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

  const connectionStatus: ConnectionStatus = liveReal ? 'live' : isRunning ? 'ingest' : 'paused'

  return (
    <div className="min-h-screen bg-[var(--bg)] pb-28 text-[var(--text)] lg:pb-6">
      <motion.div
        className="mx-auto max-w-[1280px] p-4 sm:p-6"
        initial="hidden"
        animate="visible"
        variants={pageVariants}
      >
        <motion.div variants={sectionVariants}>
          <Header
            postCount={posts.length}
            clusterCount={clusters.length}
            connectionStatus={connectionStatus}
            xApiStatus={xApiStatus}
            isRunning={isRunning}
            liveReal={liveReal}
            onToggleFeed={toggleFeed}
            onReset={reset}
            onAddCustomPost={addCustomPost}
            onToggleLiveReal={() => setLiveReal(!liveReal)}
            onExportState={exportState}
            onExportMarkdown={exportMarkdownThread}
            onLogToMakerlog={logToMakerlog}
          />
        </motion.div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <motion.div className="lg:col-span-5" variants={sectionVariants}>
            <FeedPanel
              posts={posts}
              filteredPosts={filteredPosts}
              feedSearch={feedSearch}
              isRunning={isRunning}
              radars={radars}
              maxRadars={config.maxRadars}
              defaultQueries={config.defaultQueries}
              syncingRadarId={syncingRadarId}
              onFeedSearchChange={setFeedSearch}
              onForceIngest={forceIngest}
              onSyncReal={syncReal}
              onTestConnection={testRealConnection}
              onAddRadar={handleAddRadar}
              onDeleteRadar={handleDeleteRadar}
              onSyncRadar={syncRadar}
            />
          </motion.div>

          <motion.div className="lg:col-span-4" variants={sectionVariants}>
            <ClusterPanel
              clusters={topClusters}
              selectedClusterId={selectedCluster?.id ?? null}
              onSelectCluster={setSelectedCluster}
            />
          </motion.div>

          <motion.div className="space-y-4 lg:col-span-3" variants={sectionVariants}>
            <AnalyticsSidebar
              posts={posts}
              clusters={clusters}
              onSyncReal={syncReal}
              onSelectCluster={(name) => {
                const match = clusters.find(c => c.name === name)
                if (match) setSelectedCluster(match)
              }}
            />
            <InsightsPanel insights={insights} />
            <ForgePanel
              selectedCluster={selectedCluster}
              customTopic={customTopic}
              sparks={sparks}
              forgedFlash={forgedFlash}
              onCustomTopicChange={setCustomTopic}
              onForge={forge}
              onAnalyzeWithGrok={analyzeWithGrok}
              onCopySparks={copySparks}
            />
          </motion.div>

          <motion.div className="mt-2 lg:col-span-12" variants={sectionVariants}>
            <VolumeChart chartData={chartData} />
          </motion.div>
        </div>
      </motion.div>

      <MobileActionBar onSyncReal={syncReal} onForge={forge} />
    </div>
  )
}

export default App
