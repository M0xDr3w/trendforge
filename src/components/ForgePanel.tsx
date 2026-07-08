import { Target, Lightbulb, Sparkles } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import type { Cluster } from '../lib/types'
import { GlowDivider, HudLabel, NeoButton, Panel } from './ui'

interface ForgePanelProps {
  selectedCluster: Cluster | null
  customTopic: string
  sparks: string[]
  forgedFlash: boolean
  onCustomTopicChange: (value: string) => void
  onForge: () => void
  onAnalyzeWithGrok: () => void
  onCopySparks: () => void
}

export function ForgePanel({
  selectedCluster,
  customTopic,
  sparks,
  forgedFlash,
  onCustomTopicChange,
  onForge,
  onAnalyzeWithGrok,
  onCopySparks,
}: ForgePanelProps) {
  const reduceMotion = useReducedMotion()

  return (
    <Panel glow padding="md" className="relative overflow-hidden">
      {!reduceMotion && forgedFlash && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-10 rounded-[var(--radius-lg)] border border-[var(--green)] bg-[var(--green)]/5"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: [0, 0.85, 0], scale: [0.98, 1.01, 1] }}
          transition={{ duration: 0.85, ease: 'easeOut' }}
          aria-hidden
        />
      )}
      <HudLabel className="mb-2 flex items-center gap-2 text-xs">
        <Target size={14} aria-hidden /> Content forge
      </HudLabel>
      <div className="mb-2 text-sm">
        Selected: <span className="text-[var(--accent)]">{selectedCluster?.name || 'Global'}</span>
      </div>
      <input
        value={customTopic}
        onChange={e => onCustomTopicChange(e.target.value)}
        placeholder="Custom topic..."
        aria-label="Custom forge topic"
        className="mb-3 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
      />
      <NeoButton
        onClick={onForge}
        variant="primary"
        fullWidth
        className="relative hidden rounded-[var(--radius-md)] lg:flex"
        aria-label="Forge unique content angles and copy to clipboard"
      >
        <Lightbulb size={16} aria-hidden /> Forge unique angles
      </NeoButton>
      <NeoButton
        onClick={onAnalyzeWithGrok}
        disabled={!selectedCluster}
        variant="ghost"
        fullWidth
        size="sm"
        className="mt-2"
        aria-label="Copy Grok analysis prompt with xapi MCP"
      >
        Ask Grok + X MCP
      </NeoButton>
      <div className="mt-2 text-center text-[10px] text-[var(--muted)]" aria-live="polite">
        {forgedFlash ? 'Copied to clipboard' : 'First idea copied to clipboard'}
      </div>

      {sparks.length > 0 && (
        <>
          <GlowDivider className="my-4" />
          <HudLabel className="mb-2 flex items-center gap-2 text-xs">
            <Sparkles size={14} aria-hidden /> Sparks
          </HudLabel>
          <div className="mb-3 space-y-1.5">
            {sparks.map((s, i) => (
              <div
                key={i}
                className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--panel)] p-2 text-xs leading-snug"
              >
                {s}
              </div>
            ))}
          </div>
          <NeoButton onClick={onCopySparks} fullWidth size="xs" aria-label="Copy spark ideas to clipboard">
            Copy sparks
          </NeoButton>
        </>
      )}
    </Panel>
  )
}
