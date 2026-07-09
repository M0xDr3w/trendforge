import { Target, Lightbulb, Sparkles, Loader2 } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import type { Cluster } from '../lib/types'
import type { ForgeMode } from '../lib/forge'
import { GlowDivider, HudLabel, NeoButton, Panel, FieldInput } from './ui'

interface ForgePanelProps {
  selectedCluster: Cluster | null
  customTopic: string
  sparks: string[]
  forgedFlash: boolean
  forgeMode: ForgeMode
  forgeUrl: string
  forgeApiKey: string
  llmLoading: boolean
  llmStreamPreview: string
  onCustomTopicChange: (value: string) => void
  onForgeModeChange: (mode: ForgeMode) => void
  onForgeUrlChange: (url: string) => void
  onForgeApiKeyChange: (apiKey: string) => void
  onForge: () => void
  onCopyForgePrompt: () => void
  onAnalyzeWithGrok: () => void
  onCopySparks: () => void
}

export function ForgePanel({
  selectedCluster,
  customTopic,
  sparks,
  forgedFlash,
  forgeMode,
  forgeUrl,
  forgeApiKey,
  llmLoading,
  llmStreamPreview,
  onCustomTopicChange,
  onForgeModeChange,
  onForgeUrlChange,
  onForgeApiKeyChange,
  onForge,
  onCopyForgePrompt,
  onAnalyzeWithGrok,
  onCopySparks,
}: ForgePanelProps) {
  const reduceMotion = useReducedMotion()
  const llmReady = forgeUrl.trim().length > 0
  const previewLines = llmStreamPreview
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .slice(-5)

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

      <div className="mb-3 flex gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] p-0.5">
        <NeoButton
          size="xs"
          variant={forgeMode === 'templates' ? 'active' : 'ghost'}
          className="flex-1"
          onClick={() => onForgeModeChange('templates')}
          aria-pressed={forgeMode === 'templates'}
        >
          Templates
        </NeoButton>
        <NeoButton
          size="xs"
          variant={forgeMode === 'llm' ? 'active' : 'ghost'}
          className="flex-1"
          onClick={() => onForgeModeChange('llm')}
          disabled={!llmReady}
          aria-pressed={forgeMode === 'llm'}
          title={llmReady ? 'Use ForgeRouter LLM' : 'Set ForgeRouter URL below first'}
        >
          LLM
        </NeoButton>
      </div>

      <FieldInput
        value={forgeUrl}
        onChange={e => onForgeUrlChange(e.target.value)}
        placeholder="Gateway URL (Ollama :11434, LM Studio :1234/v1, …)"
        aria-label="LLM gateway base URL"
        className="mb-2 text-xs"
      />
      <FieldInput
        value={forgeApiKey}
        onChange={e => onForgeApiKeyChange(e.target.value)}
        type="password"
        autoComplete="off"
        placeholder="API key (optional — cloud gateways only)"
        aria-label="Optional LLM gateway API key"
        className="mb-3 text-xs"
      />
      {!llmReady && (
        <p className="mb-3 text-[11px] leading-snug text-[var(--muted)]">
          Paste a local OpenAI-compatible base URL to unlock LLM mode (with or without trailing /v1).
          Templates work offline anytime.
        </p>
      )}
      {llmReady && (
        <p className="mb-3 text-[11px] leading-snug text-[var(--muted)]">
          Examples: <span className="text-[var(--text)]">http://127.0.0.1:11434</span> (Ollama) ·{' '}
          <span className="text-[var(--text)]">http://127.0.0.1:1234/v1</span> (LM Studio). Key stays in sessionStorage (clears when the tab closes).
        </p>
      )}

      <FieldInput
        value={customTopic}
        onChange={e => onCustomTopicChange(e.target.value)}
        placeholder="Custom topic override..."
        aria-label="Custom forge topic"
        className="mb-3"
      />

      {llmLoading ? (
        <div className="mb-3 space-y-2" aria-busy="true" aria-label="Generating forge content">
          {previewLines.length > 0 ? (
            <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--cyan)]/30 bg-[var(--input-bg)] p-2.5">
              <HudLabel className="mb-1 block text-[10px] text-[var(--cyan)]">Streaming…</HudLabel>
              {previewLines.map((line, i) => (
                <p key={`${i}-${line.slice(0, 12)}`} className="text-[12px] leading-snug text-[var(--text)]">
                  {line}
                </p>
              ))}
            </div>
          ) : (
            [1, 2, 3].map(i => (
              <div key={i} className="h-8 animate-pulse rounded-[var(--radius-sm)] bg-[var(--panel)]" />
            ))
          )}
        </div>
      ) : (
        <NeoButton
          onClick={onForge}
          variant="primary"
          fullWidth
          className="relative hidden rounded-[var(--radius-md)] lg:flex"
          disabled={llmLoading}
          aria-label="Forge unique content angles and copy to clipboard"
        >
          {llmLoading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Lightbulb size={16} aria-hidden />}
          {forgeMode === 'llm' ? 'Forge with LLM' : 'Forge unique angles'}
        </NeoButton>
      )}

      <NeoButton
        onClick={onCopyForgePrompt}
        variant="ghost"
        fullWidth
        size="sm"
        className="mt-2 flex"
        aria-label="Copy LLM forge prompt to clipboard"
      >
        Copy forge prompt
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
        {forgedFlash
          ? 'Copied to clipboard'
          : forgeMode === 'llm' && llmReady
            ? 'LLM mode — streams from your gateway, falls back to templates on error'
            : 'First idea copied to clipboard'}
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
                className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--input-bg)] p-2.5 text-[13px] leading-relaxed text-[var(--text)]"
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
