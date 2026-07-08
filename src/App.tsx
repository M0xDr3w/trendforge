import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { config } from './lib/config'
import { computeClusters, buildVolumeSnapshot } from './lib/clusters'
import { detectInsights } from './lib/narrative'
import { generateSparks } from './lib/insights'
import { seedPosts, generateMockPost, fetchRealPosts, mergePosts } from './lib/feed'
import { loadRadars, saveRadars, addRadar, deleteRadar, updateRadarLastSynced } from './lib/radars'
import { downloadExportBundle, downloadMarkdownThread, type ExportContext } from './lib/export'
import {
  findNewShiftAlerts,
  formatShiftAlertMessage,
  loadAlertsEnabled,
  loadBrowserNotify,
  requestBrowserNotificationPermission,
  saveAlertsEnabled,
  saveBrowserNotify,
  showBrowserNotification,
} from './lib/alerts'
import {
  buildForgePrompt,
  callForgeLlm,
  forgeContent,
  loadForgeUrl,
  parseForgeResponse,
  saveForgeUrl,
  type ForgeMode,
} from './lib/forge'
import { Header } from './components/Header'
import { FeedPanel } from './components/FeedPanel'
import { ClusterPanel } from './components/ClusterPanel'
import { InsightsPanel } from './components/InsightsPanel'
import { ForgePanel } from './components/ForgePanel'
import { Panel } from './components/ui'
import { MobileAnalyticsDrawer } from './components/MobileAnalyticsDrawer'
import { MobileActionBar } from './components/MobileActionBar'
import { XApiStatusBanner } from './components/XApiStatusBanner'
import { pageVariants, sectionVariants, type ConnectionStatus } from './components/motion'
import type { XApiConnectionStatus, XApiError } from './lib/xApiErrors'
import { isFatalXApiError, showXApiErrorToast } from './lib/xApiErrors'
import type { XPost, Cluster, SavedRadar } from './lib/types'

const VolumeChart = lazy(() =>
  import('./components/VolumeChart').then(m => ({ default: m.VolumeChart })),
)

function ChartSectionFallback({ label }: { label: string }) {
  return (
    <Panel padding="md" className="flex h-48 items-center justify-center text-xs text-[var(--muted)]">
      Loading {label}…
    </Panel>
  )
}

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
  const [lastXApiError, setLastXApiError] = useState<XApiError | null>(null)
  const [xApiBannerDismissed, setXApiBannerDismissed] = useState(false)
  const [radars, setRadars] = useState<SavedRadar[]>(() =>
    loadRadars(config.defaultQueries, config.maxRadars),
  )
  const [syncingRadarId, setSyncingRadarId] = useState<string | null>(null)
  const [forgeMode, setForgeMode] = useState<ForgeMode>('templates')
  const [forgeUrl, setForgeUrl] = useState(() => loadForgeUrl())
  const [llmLoading, setLlmLoading] = useState(false)
  const [alertsEnabled, setAlertsEnabled] = useState(() => loadAlertsEnabled())
  const [browserNotify, setBrowserNotify] = useState(() => loadBrowserNotify())
  const liveRealToastShownRef = useRef(false)
  const shiftNotifiedRef = useRef<Record<string, number>>({})

  const clusters = computeClusters(posts, history)
  const previousVolumes = history.length > 0 ? history[history.length - 1] : {}
  const insights = detectInsights(clusters, previousVolumes)
  const sparks = selectedCluster
    ? generateSparks({ name: selectedCluster.name, category: selectedCluster.name })
    : []

  const exportContext: ExportContext = {
    selectedCluster,
    customTopic,
    posts,
    clusters,
    insights,
    radars,
  }

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
    saveForgeUrl(forgeUrl)
  }, [forgeUrl])

  const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

  const reportXApiFailure = useCallback((error: XApiError, context?: string) => {
    setXApiStatus('error')
    setLastXApiError(error)
    setXApiBannerDismissed(false)
    showXApiErrorToast(error)
    if (context) {
      toast.error(context, { description: error.message, duration: 8000 })
    }
  }, [])

  const fetchRadarPosts = useCallback(
    async (query: string, radarName: string) => {
      let result = await fetchRealPosts(query, { silent: true })
      if (result.error?.code === 'rate_limit') {
        toast.info(`Rate limited on "${radarName}"`, { description: 'Waiting 8s, then retrying once…' })
        await sleep(8000)
        result = await fetchRealPosts(query, { silent: true })
      }
      return result
    },
    [],
  )

  useEffect(() => {
    if (!alertsEnabled) return
    const { alerts, nextNotified } = findNewShiftAlerts(
      clusters,
      config.alertShiftThreshold,
      shiftNotifiedRef.current,
    )
    shiftNotifiedRef.current = nextNotified
    for (const c of clusters) {
      if (c.shift < config.alertShiftThreshold) {
        delete shiftNotifiedRef.current[c.name]
      }
    }
    for (const alert of alerts) {
      const message = formatShiftAlertMessage(alert)
      toast.success('Shift alert', {
        description: `${message} · ${alert.volume} posts — tap cluster to forge`,
      })
      if (browserNotify) {
        showBrowserNotification('TrendForge shift', message)
      }
    }
  }, [clusters, alertsEnabled, browserNotify])

  useEffect(() => {
    if (!liveReal) {
      liveRealToastShownRef.current = false
      return
    }
    if (!liveRealToastShownRef.current) {
      toast.info(`Live Real X polling enabled (every ~${config.liveRealPollMs / 1000}s)`)
      liveRealToastShownRef.current = true
    }
    const id = setInterval(async () => {
      const { posts: fresh, error } = await fetchRealPosts(config.liveRealQuery, { silent: true })
      if (error) {
        setXApiStatus('error')
        setLastXApiError(error)
        setXApiBannerDismissed(false)
        return
      }
      if (fresh.length > 0) {
        setXApiStatus('connected')
        setLastXApiError(null)
        setPosts(prev => mergePosts(prev, fresh))
      }
    }, config.liveRealPollMs)
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
    shiftNotifiedRef.current = {}
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

  const forge = useCallback(async () => {
    const currentSparks = selectedCluster
      ? generateSparks({ name: selectedCluster.name, category: selectedCluster.name })
      : []
    const sparkNote = currentSparks.length > 0 ? `\n\nSpark: ${currentSparks[0]}` : ''

    let ideas: string[]

    if (forgeMode === 'llm' && forgeUrl.trim()) {
      setLlmLoading(true)
      try {
        const prompt = buildForgePrompt(selectedCluster, currentSparks, insights, customTopic || undefined)
        const response = await callForgeLlm(forgeUrl.trim(), prompt)
        ideas = parseForgeResponse(response)
        toast.success('LLM forged content', { description: ideas[0]?.slice(0, 75) + '...' })
      } catch (err) {
        ideas = forgeContent(selectedCluster, customTopic || undefined)
        toast.error('LLM forge failed — using templates', {
          description: err instanceof Error ? err.message : 'Unknown error',
        })
      } finally {
        setLlmLoading(false)
      }
    } else {
      ideas = forgeContent(selectedCluster, customTopic || undefined)
      toast.success('Content forged', { description: ideas[0].slice(0, 75) + '...' })
    }

    navigator.clipboard?.writeText(ideas.join('\n\n') + sparkNote).catch(() => {})
    setForgedFlash(true)
    window.setTimeout(() => setForgedFlash(false), 900)
  }, [selectedCluster, customTopic, forgeMode, forgeUrl, insights])

  const copyForgePrompt = useCallback(() => {
    const currentSparks = selectedCluster
      ? generateSparks({ name: selectedCluster.name, category: selectedCluster.name })
      : []
    const prompt = buildForgePrompt(selectedCluster, currentSparks, insights, customTopic || undefined)
    navigator.clipboard?.writeText(prompt).catch(() => {})
    toast.success('Forge prompt copied')
  }, [selectedCluster, customTopic, insights])

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
    downloadMarkdownThread(exportContext)
    toast.success('Markdown thread + JSON sidecar downloaded', { description: 'Ready to post or pipe to other Forges' })
  }

  const exportBundle = async () => {
    await downloadExportBundle(exportContext)
    toast.success('Export bundle downloaded', {
      description: 'thread.md, meta.json, and signals.json with shared prefix',
    })
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

  const toggleAlerts = async () => {
    const next = !alertsEnabled
    setAlertsEnabled(next)
    saveAlertsEnabled(next)
    if (next && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      const perm = await requestBrowserNotificationPermission()
      const granted = perm === 'granted'
      setBrowserNotify(granted)
      saveBrowserNotify(granted)
    }
    toast.info(next ? 'Shift alerts enabled' : 'Shift alerts muted')
  }

  const syncRadar = async (radar: SavedRadar) => {
    setSyncingRadarId(radar.id)
    const { posts: realPosts, error } = await fetchRadarPosts(radar.query, radar.name)
    setSyncingRadarId(null)
    if (error) {
      reportXApiFailure(error, `Sync failed for "${radar.name}"`)
      return
    }
    if (realPosts.length > 0) {
      setXApiStatus('connected')
      setLastXApiError(null)
      setPosts(prev => mergePosts(prev, realPosts))
      setRadars(prev => updateRadarLastSynced(prev, radar.id))
      setFeedSearch('')
      toast.success(`Synced ${realPosts.length} posts for "${radar.name}"`)
    } else {
      toast.info(`No new posts for "${radar.name}"`)
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

  const syncAllRadars = async () => {
    if (radars.length === 0) {
      toast.info('No saved radars to sync')
      return
    }
    let merged = 0
    let syncedCount = 0
    for (let i = 0; i < radars.length; i++) {
      const radar = radars[i]
      setSyncingRadarId(radar.id)
      const { posts: realPosts, error } = await fetchRadarPosts(radar.query, radar.name)
      if (error) {
        setSyncingRadarId(null)
        const progress = syncedCount > 0 ? ` (${syncedCount}/${radars.length} radars synced before failure)` : ''
        reportXApiFailure(
          error,
          isFatalXApiError(error.code)
            ? `Sync all stopped at "${radar.name}"${progress}`
            : `Sync all failed on "${radar.name}"${progress}`,
        )
        return
      }
      if (realPosts.length > 0) {
        setXApiStatus('connected')
        setLastXApiError(null)
        setPosts(prev => mergePosts(prev, realPosts))
        setRadars(prev => updateRadarLastSynced(prev, radar.id))
        merged += realPosts.length
      }
      syncedCount += 1
      if (i < radars.length - 1) {
        await sleep(config.syncRadarDelayMs)
      }
    }
    setSyncingRadarId(null)
    setFeedSearch('')
    toast.success(`Synced ${radars.length} radars`, { description: `${merged} posts merged into feed` })
  }

  const syncReal = async () => {
    const q = prompt('X search query:', config.defaultSyncQuery)
    if (!q) return
    const { posts: realPosts, error } = await fetchRadarPosts(q, 'manual sync')
    if (error) {
      reportXApiFailure(error)
      return
    }
    if (realPosts.length > 0) {
      setXApiStatus('connected')
      setLastXApiError(null)
      setPosts(prev => mergePosts(prev, realPosts))
      setFeedSearch('')
      toast.success(`Synced ${realPosts.length} real posts from X (merged)`)
    }
  }

  const testRealConnection = async () => {
    toast.info('Testing /api/x-search proxy...')
    const { posts: testPosts, error } = await fetchRealPosts('AI')
    if (error) {
      reportXApiFailure(error)
      return
    }
    if (testPosts.length > 0) {
      setXApiStatus('connected')
      setLastXApiError(null)
      setXApiBannerDismissed(true)
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
            alertsEnabled={alertsEnabled}
            onToggleAlerts={toggleAlerts}
            onExportState={exportState}
            onExportMarkdown={exportMarkdownThread}
            onExportBundle={exportBundle}
            onLogToMakerlog={logToMakerlog}
          />
        </motion.div>

        {lastXApiError && !xApiBannerDismissed && (
          <motion.div variants={sectionVariants}>
            <XApiStatusBanner
              error={lastXApiError}
              onDismiss={() => setXApiBannerDismissed(true)}
              onRetryTest={testRealConnection}
            />
          </motion.div>
        )}

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
              onSyncAllRadars={syncAllRadars}
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
            <MobileAnalyticsDrawer
              posts={posts}
              clusters={clusters}
              onSyncReal={syncReal}
              onSelectCluster={(name) => {
                const match = clusters.find(c => c.name === name)
                if (match) setSelectedCluster(match)
              }}
            />
            <InsightsPanel insights={insights} postCount={posts.length} />
            <ForgePanel
              selectedCluster={selectedCluster}
              customTopic={customTopic}
              sparks={sparks}
              forgedFlash={forgedFlash}
              forgeMode={forgeMode}
              forgeUrl={forgeUrl}
              llmLoading={llmLoading}
              onCustomTopicChange={setCustomTopic}
              onForgeModeChange={setForgeMode}
              onForgeUrlChange={setForgeUrl}
              onForge={forge}
              onCopyForgePrompt={copyForgePrompt}
              onAnalyzeWithGrok={analyzeWithGrok}
              onCopySparks={copySparks}
            />
          </motion.div>

          <motion.div className="mt-2 lg:col-span-12" variants={sectionVariants}>
            <Suspense fallback={<ChartSectionFallback label="volume chart" />}>
              <VolumeChart chartData={chartData} />
            </Suspense>
          </motion.div>
        </div>
      </motion.div>

      <MobileActionBar onSyncReal={syncReal} onForge={forge} />
    </div>
  )
}

export default App
