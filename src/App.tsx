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
  defaultsForProvider,
  forgeContent,
  formatForgeLlmError,
  loadForgeApiKey,
  loadForgeModel,
  loadForgeProvider,
  loadForgeUrl,
  parseForgeResponse,
  saveForgeApiKey,
  saveForgeModel,
  saveForgeProvider,
  saveForgeUrl,
  type ForgeMode,
  type ForgeProvider,
} from './lib/forge'
import {
  appendPreference,
  loadLastForge,
  loadPreferences,
  saveLastForge,
  summarizePreferencesForPrompt,
  type ForgeSource,
  type LastForgeResult,
} from './lib/preferences'
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
  const [forgeProvider, setForgeProvider] = useState<ForgeProvider>(() => loadForgeProvider())
  const [forgeUrl, setForgeUrl] = useState(() => loadForgeUrl())
  const [forgeApiKey, setForgeApiKey] = useState(() => loadForgeApiKey())
  const [forgeModel, setForgeModel] = useState(() => loadForgeModel())
  const [lastForge, setLastForge] = useState<LastForgeResult | null>(() => loadLastForge())
  const [preferenceCount, setPreferenceCount] = useState(() => loadPreferences().length)
  const [llmLoading, setLlmLoading] = useState(false)
  const [llmStreamPreview, setLlmStreamPreview] = useState('')
  const [alertsEnabled, setAlertsEnabled] = useState(() => loadAlertsEnabled())
  const [browserNotify, setBrowserNotify] = useState(() => loadBrowserNotify())
  const liveRealToastShownRef = useRef(false)
  const dismissedErrorCodeRef = useRef<string | null>(null)
  const forgeInFlightRef = useRef(false)
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
    forgedAngles: lastForge?.angles ?? null,
    forgeSource: lastForge?.source ?? null,
    forgeModel: lastForge?.model ?? null,
    forgeProvider: lastForge?.provider ?? null,
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

  useEffect(() => {
    saveForgeApiKey(forgeApiKey)
  }, [forgeApiKey])

  useEffect(() => {
    saveForgeModel(forgeModel)
  }, [forgeModel])

  useEffect(() => {
    saveForgeProvider(forgeProvider)
  }, [forgeProvider])

  useEffect(() => {
    if (lastForge) saveLastForge(lastForge)
  }, [lastForge])

  const handleForgeProviderChange = useCallback((provider: ForgeProvider) => {
    setForgeProvider(provider)
    const defaults = defaultsForProvider(provider)
    if (provider === 'grok') {
      setForgeUrl(defaults.url)
      setForgeModel(defaults.model)
    } else if (provider === 'local') {
      setForgeUrl(prev => (prev.trim() && !prev.startsWith('/') ? prev : defaults.url))
      setForgeModel(prev => (prev.trim() && prev !== 'grok-4.5' ? prev : defaults.model))
    }
    // custom: leave URL/model for the user
  }, [])

  const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

  // Surface an error for the banner. Re-open the banner only when the error is
  // new — a banner the user dismissed shouldn't reappear every live-real poll
  // while the same error persists.
  const surfaceXApiError = useCallback((error: XApiError) => {
    setXApiStatus('error')
    setLastXApiError(error)
    if (error.code !== dismissedErrorCodeRef.current) {
      setXApiBannerDismissed(false)
    }
  }, [])

  const clearXApiError = useCallback(() => {
    setLastXApiError(null)
    dismissedErrorCodeRef.current = null
  }, [])

  const dismissXApiBanner = useCallback(() => {
    dismissedErrorCodeRef.current = lastXApiError?.code ?? null
    setXApiBannerDismissed(true)
  }, [lastXApiError])

  const reportXApiFailure = useCallback((error: XApiError, context?: string) => {
    surfaceXApiError(error)
    // One toast only: a context message replaces the default error toast.
    if (context) {
      toast.error(context, { description: error.hint, duration: 8000 })
    } else {
      showXApiErrorToast(error)
    }
  }, [surfaceXApiError])

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
        surfaceXApiError(error)
        return
      }
      if (fresh.length > 0) {
        setXApiStatus('connected')
        clearXApiError()
        setPosts(prev => mergePosts(prev, fresh))
      }
    }, config.liveRealPollMs)
    return () => clearInterval(id)
  }, [liveReal, surfaceXApiError, clearXApiError])

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

  const commitForgeResult = useCallback(
    (ideas: string[], source: ForgeSource) => {
      const topic = customTopic || selectedCluster?.name || 'emerging signal'
      const result: LastForgeResult = {
        angles: ideas,
        topic,
        clusterName: selectedCluster?.name ?? null,
        source,
        model: forgeMode === 'llm' ? forgeModel : undefined,
        provider: forgeMode === 'llm' ? forgeProvider : undefined,
        createdAt: new Date().toISOString(),
      }
      setLastForge(result)
      saveLastForge(result)
    },
    [customTopic, selectedCluster, forgeMode, forgeModel, forgeProvider],
  )

  const forge = useCallback(async () => {
    // Block re-entry so rapid taps can't launch overlapping LLM requests.
    if (forgeInFlightRef.current) return
    forgeInFlightRef.current = true

    const currentSparks = selectedCluster
      ? generateSparks({ name: selectedCluster.name, category: selectedCluster.name })
      : []
    const sparkNote = currentSparks.length > 0 ? `\n\nSpark: ${currentSparks[0]}` : ''

    let ideas: string[]
    let source: ForgeSource = 'templates'

    const llmEndpoint =
      forgeProvider === 'grok' ? defaultsForProvider('grok').url : forgeUrl.trim()
    const canLlm = forgeMode === 'llm' && llmEndpoint.length > 0

    try {
      if (canLlm) {
        setLlmLoading(true)
        setLlmStreamPreview('')
        try {
          const preferenceHint = summarizePreferencesForPrompt(loadPreferences())
          const prompt = buildForgePrompt(
            selectedCluster,
            currentSparks,
            insights,
            customTopic || undefined,
            { preferenceHint },
          )
          const response = await callForgeLlm(llmEndpoint, prompt, {
            stream: true,
            apiKey: forgeApiKey,
            model: forgeModel,
            onChunk: partial => setLlmStreamPreview(partial),
          })
          ideas = parseForgeResponse(response)
          source = 'llm'
          toast.success(
            forgeProvider === 'grok' ? 'Grok forged content' : 'LLM forged content',
            { description: ideas[0]?.slice(0, 75) + '...' },
          )
        } catch (err) {
          ideas = forgeContent(selectedCluster, customTopic || undefined)
          source = 'llm-fallback'
          const formatted = formatForgeLlmError(err)
          toast.error(formatted.title, { description: formatted.description, duration: 8000 })
        } finally {
          setLlmLoading(false)
          setLlmStreamPreview('')
        }
      } else {
        ideas = forgeContent(selectedCluster, customTopic || undefined)
        source = 'templates'
        toast.success('Content forged', { description: ideas[0].slice(0, 75) + '...' })
      }

      commitForgeResult(ideas, source)
      navigator.clipboard?.writeText(ideas.join('\n\n') + sparkNote).catch(() => {})
      setForgedFlash(true)
      window.setTimeout(() => setForgedFlash(false), 900)
    } finally {
      forgeInFlightRef.current = false
    }
  }, [
    selectedCluster,
    customTopic,
    forgeMode,
    forgeProvider,
    forgeUrl,
    forgeApiKey,
    forgeModel,
    insights,
    commitForgeResult,
  ])

  const handlePreference = useCallback(
    (decision: 'accept' | 'edit' | 'reject') => {
      if (!lastForge) {
        toast.info('Forge first, then gate the result')
        return
      }
      if (decision === 'edit') {
        const revised = window.prompt(
          'Edit angles (one per line). Saves preference for the learn loop.',
          lastForge.angles.join('\n'),
        )
        if (revised == null) return
        const editedAngles = revised
          .split('\n')
          .map(l => l.replace(/^\s*\d+[.)]\s*/, '').trim())
          .filter(Boolean)
        if (editedAngles.length === 0) {
          toast.error('No angles kept')
          return
        }
        appendPreference({
          decision: 'edit',
          topic: lastForge.topic,
          angles: lastForge.angles,
          editedAngles,
          clusterName: lastForge.clusterName,
          source: lastForge.source,
          model: lastForge.model,
          provider: lastForge.provider,
        })
        const next: LastForgeResult = {
          ...lastForge,
          angles: editedAngles,
          createdAt: new Date().toISOString(),
        }
        setLastForge(next)
        saveLastForge(next)
        setPreferenceCount(loadPreferences().length)
        toast.success('Edited angles saved', {
          description: 'Preference logged · next LLM forge uses your edit · export updated',
        })
        return
      }
      appendPreference({
        decision,
        topic: lastForge.topic,
        angles: lastForge.angles,
        clusterName: lastForge.clusterName,
        source: lastForge.source,
        model: lastForge.model,
        provider: lastForge.provider,
      })
      setPreferenceCount(loadPreferences().length)
      toast.success(decision === 'accept' ? 'Accepted for learn loop' : 'Rejected for learn loop', {
        description: 'Stored locally — next LLM forge uses this taste · never auto-posts',
      })
    },
    [lastForge],
  )

  const copyForgePrompt = useCallback(() => {
    const currentSparks = selectedCluster
      ? generateSparks({ name: selectedCluster.name, category: selectedCluster.name })
      : []
    const preferenceHint = summarizePreferencesForPrompt(loadPreferences())
    const prompt = buildForgePrompt(
      selectedCluster,
      currentSparks,
      insights,
      customTopic || undefined,
      { preferenceHint },
    )
    navigator.clipboard?.writeText(prompt).catch(() => {})
    toast.success(
      preferenceHint ? 'Forge prompt copied (includes learn-loop taste)' : 'Forge prompt copied',
    )
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

  const copyAngles = () => {
    if (!lastForge || lastForge.angles.length === 0) {
      toast.info('Forge content first to copy angles')
      return
    }
    navigator.clipboard?.writeText(lastForge.angles.join('\n\n')).catch(() => {})
    toast.success('Angles copied', { description: lastForge.angles[0].slice(0, 75) + '...' })
  }

  const copyThread = () => {
    if (!lastForge || lastForge.angles.length === 0) {
      toast.info('Forge content first to copy thread')
      return
    }
    // Plain-text thread: one angle per paragraph. Ready to paste into X/LinkedIn.
    const thread = lastForge.angles.join('\n\n')
    navigator.clipboard?.writeText(thread).catch(() => {})
    toast.success('Thread copied', { description: lastForge.angles[0].slice(0, 75) + '...' })
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
      clearXApiError()
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
    let failedCount = 0
    for (let i = 0; i < radars.length; i++) {
      const radar = radars[i]
      setSyncingRadarId(radar.id)
      const { posts: realPosts, error } = await fetchRadarPosts(radar.query, radar.name)
      if (error) {
        const progress = syncedCount > 0 ? ` (${syncedCount}/${radars.length} radars synced before failure)` : ''
        // Fatal errors (auth/token/credits) won't recover mid-batch — stop early.
        if (isFatalXApiError(error.code)) {
          setSyncingRadarId(null)
          reportXApiFailure(error, `Sync all stopped at "${radar.name}"${progress}`)
          return
        }
        // Transient errors (rate limit, network) — report and keep going.
        failedCount += 1
        reportXApiFailure(error, `Skipped "${radar.name}" (${error.message})`)
        if (i < radars.length - 1) {
          await sleep(config.syncRadarDelayMs)
        }
        continue
      }
      if (realPosts.length > 0) {
        setXApiStatus('connected')
        clearXApiError()
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
    const description =
      failedCount > 0
        ? `${merged} posts merged · ${syncedCount} ok, ${failedCount} skipped`
        : `${merged} posts merged into feed`
    toast.success(`Synced ${syncedCount}/${radars.length} radars`, { description })
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
      clearXApiError()
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
      clearXApiError()
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
              onDismiss={dismissXApiBanner}
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
              forgeProvider={forgeProvider}
              forgeUrl={forgeUrl}
              forgeApiKey={forgeApiKey}
              forgeModel={forgeModel}
              llmLoading={llmLoading}
              llmStreamPreview={llmStreamPreview}
              lastForge={lastForge}
              preferenceCount={preferenceCount}
              onCustomTopicChange={setCustomTopic}
              onForgeModeChange={setForgeMode}
              onForgeProviderChange={handleForgeProviderChange}
              onForgeUrlChange={setForgeUrl}
              onForgeApiKeyChange={setForgeApiKey}
              onForgeModelChange={setForgeModel}
              onForge={forge}
              onCopyForgePrompt={copyForgePrompt}
              onAnalyzeWithGrok={analyzeWithGrok}
              onCopySparks={copySparks}
              onCopyAngles={copyAngles}
              onCopyThread={copyThread}
              onPreference={handlePreference}
            />
          </motion.div>

          <motion.div className="mt-2 lg:col-span-12" variants={sectionVariants}>
            <Suspense fallback={<ChartSectionFallback label="volume chart" />}>
              <VolumeChart chartData={chartData} />
            </Suspense>
          </motion.div>
        </div>
      </motion.div>

      <MobileActionBar onSyncReal={syncReal} onForge={forge} forgeLoading={llmLoading} />
    </div>
  )
}

export default App
