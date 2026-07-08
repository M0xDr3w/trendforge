import { Play, Pause, RefreshCw } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { HudLabel, NeoButton, StatPill } from './ui'
import { connectionLabel, type ConnectionStatus } from './motion'
import { xApiStatusLabel, type XApiConnectionStatus } from '../lib/xApiErrors'

interface HeaderProps {
  postCount: number
  clusterCount: number
  connectionStatus: ConnectionStatus
  xApiStatus: XApiConnectionStatus
  isRunning: boolean
  liveReal: boolean
  onToggleFeed: () => void
  onReset: () => void
  onAddCustomPost: () => void
  onToggleLiveReal: () => void
  onExportState: () => void
  onExportMarkdown: () => void
  onLogToMakerlog: () => void
}

export function Header({
  postCount,
  clusterCount,
  connectionStatus,
  xApiStatus,
  isRunning,
  liveReal,
  onToggleFeed,
  onReset,
  onAddCustomPost,
  onToggleLiveReal,
  onExportState,
  onExportMarkdown,
  onLogToMakerlog,
}: HeaderProps) {
  const reduceMotion = useReducedMotion()
  const modeVariant = liveReal ? 'accent' : connectionStatus === 'ingest' ? 'cyan' : 'default'
  const xApiVariant =
    xApiStatus === 'connected' ? 'positive' : xApiStatus === 'error' ? 'negative' : 'warning'

  return (
    <header className="mb-8 flex flex-col gap-6 border-b border-[var(--border)] pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-display text-4xl font-bold tracking-[-0.06em] text-[var(--accent)] sm:text-[52px]">
            TRENDFORGE
          </span>
          <HudLabel className="text-xs tracking-[0.2em] text-[var(--muted)]">Real-time X engine</HudLabel>
          <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1">
            <motion.div
              className={`h-2 w-2 rounded-full ${liveReal ? 'bg-[var(--accent)]' : isRunning ? 'bg-[var(--green)]' : 'bg-[var(--muted)]'}`}
              animate={
                reduceMotion || (!liveReal && !isRunning)
                  ? { scale: 1, opacity: 0.5 }
                  : { scale: [1, 1.6, 1], opacity: [0.6, 1, 0.6] }
              }
              transition={reduceMotion ? undefined : { duration: 1.4, repeat: Infinity }}
            />
            <HudLabel className="text-[10px] tracking-[0.15em] text-[var(--text)]">
              {connectionLabel(connectionStatus)}
            </HudLabel>
          </div>
        </div>
        <p className="mt-2 max-w-xl text-sm text-[var(--muted)]">
          Detect shifts. Find gaps. Forge unique angles before the crowd.{' '}
          <span className="text-xs text-[var(--accent)]">+ REAL X MCP</span>
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <StatPill label="Signals" value={postCount} variant="cyan" className="min-w-[88px]" />
          <StatPill label="Themes" value={clusterCount} variant="default" className="min-w-[88px]" />
          <StatPill label="Mode" value={connectionLabel(connectionStatus)} variant={modeVariant} className="min-w-[88px]" />
          <StatPill
            label="X API"
            value={xApiStatusLabel(xApiStatus)}
            variant={xApiVariant}
            className="min-w-[88px]"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
        <NeoButton onClick={onToggleFeed} variant={isRunning ? 'active' : 'default'} size="sm">
          {isRunning ? <Pause size={16} /> : <Play size={16} />}
          {isRunning ? 'Pause feed' : 'Start feed'}
        </NeoButton>
        <NeoButton onClick={onReset} size="sm">
          <RefreshCw size={16} /> Reset
        </NeoButton>
        <NeoButton onClick={onAddCustomPost} size="sm">+ Inject</NeoButton>
        <NeoButton
          onClick={onToggleLiveReal}
          variant={liveReal ? 'active' : 'default'}
          size="xs"
          title="Periodically pull fresh posts from the Vercel X proxy"
          aria-label={liveReal ? 'Stop live real X polling' : 'Start live real X polling'}
        >
          {liveReal ? '⏹ Live real' : '▶ Live real'}
        </NeoButton>
        <NeoButton onClick={onExportState} size="xs">Export JSON</NeoButton>
        <NeoButton onClick={onExportMarkdown} size="xs" className="border-[var(--accent)]/30 bg-[var(--accent)]/10">
          Download thread
        </NeoButton>
        <NeoButton onClick={onLogToMakerlog} size="xs">MakerLog</NeoButton>
      </div>
    </header>
  )
}
