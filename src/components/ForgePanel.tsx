import { Target, Lightbulb, Sparkles, Loader2, Check, Pencil, X } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import type { Cluster } from '../lib/types'
import type { ForgeMode, ForgeProvider } from '../lib/forge'
import type { LastForgeResult } from '../lib/preferences'
import { GlowDivider, HudLabel, NeoButton, Panel, FieldInput } from './ui'

interface ForgePanelProps {
  selectedCluster: Cluster | null
  customTopic: string
  sparks: string[]
  forgedFlash: boolean
  forgeMode: ForgeMode
  forgeProvider: ForgeProvider
  forgeUrl: string
  forgeApiKey: string
  forgeModel: string
  llmLoading: boolean
  llmStreamPreview: string
  lastForge: LastForgeResult | null
  /** Recent Accept/Edit/Reject events that will influence the next LLM forge. */
  preferenceCount?: number
  onCustomTopicChange: (value: string) => void
  onForgeModeChange: (mode: ForgeMode) => void
  onForgeProviderChange: (provider: ForgeProvider) => void
  onForgeUrlChange: (url: string) => void
  onForgeApiKeyChange: (apiKey: string) => void
  onForgeModelChange: (model: string) => void
  onForge: () => void
  onCopyForgePrompt: () => void
  onAnalyzeWithGrok: () => void
  onCopySparks: () => void
  onPreference: (decision: 'accept' | 'edit' | 'reject') => void
}

export function ForgePanel({
  selectedCluster,
  customTopic,
  sparks,
  forgedFlash,
  forgeMode,
  forgeProvider,
  forgeUrl,
  forgeApiKey,
  forgeModel,
  llmLoading,
  llmStreamPreview,
  lastForge,
  preferenceCount = 0,
  onCustomTopicChange,
  onForgeModeChange,
  onForgeProviderChange,
  onForgeUrlChange,
  onForgeApiKeyChange,
  onForgeModelChange,
  onForge,
  onCopyForgePrompt,
  onAnalyzeWithGrok,
  onCopySparks,
  onPreference,
}: ForgePanelProps) {
  const reduceMotion = useReducedMotion()
  const llmReady =
    forgeMode === 'llm' &&
    (forgeProvider === 'grok' || forgeUrl.trim().length > 0)
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
          aria-pressed={forgeMode === 'llm'}
          title="Use Grok, local gateway, or custom OpenAI-compatible URL"
        >
          LLM
        </NeoButton>
      </div>

      {forgeMode === 'llm' && (
        <>
          <div className="mb-3 flex gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] p-0.5">
            {(
              [
                ['grok', 'Grok'],
                ['local', 'Local'],
                ['custom', 'Custom'],
              ] as const
            ).map(([id, label]) => (
              <NeoButton
                key={id}
                size="xs"
                variant={forgeProvider === id ? 'active' : 'ghost'}
                className="flex-1"
                onClick={() => onForgeProviderChange(id)}
                aria-pressed={forgeProvider === id}
              >
                {label}
              </NeoButton>
            ))}
          </div>

          {forgeProvider !== 'grok' && (
            <FieldInput
              value={forgeUrl}
              onChange={e => onForgeUrlChange(e.target.value)}
              placeholder={
                forgeProvider === 'local'
                  ? 'http://127.0.0.1:11434 (Ollama) or :8123 (ForgeRouter)'
                  : 'Gateway URL (https://…)'
              }
              aria-label="LLM gateway base URL"
              className="mb-2 text-xs"
            />
          )}
          <FieldInput
            value={forgeModel}
            onChange={e => onForgeModelChange(e.target.value)}
            placeholder={forgeProvider === 'grok' ? 'grok-4.5' : 'Model tag (e.g. llama3.2)'}
            aria-label="LLM model name"
            className="mb-2 text-xs"
          />
          <FieldInput
            value={forgeApiKey}
            onChange={e => onForgeApiKeyChange(e.target.value)}
            type="password"
            autoComplete="off"
            placeholder={
              forgeProvider === 'grok'
                ? 'Optional session key (else XAI_API_KEY on server)'
                : 'API key (optional — cloud gateways only)'
            }
            aria-label="Optional LLM gateway API key"
            className="mb-3 text-xs"
          />
          {forgeProvider === 'grok' && (
            <p className="mb-3 text-[11px] leading-snug text-[var(--muted)]">
              Grok via server proxy <span className="text-[var(--text)]">/api/forge-chat</span>. Set{' '}
              <span className="text-[var(--text)]">XAI_API_KEY</span> in Vercel /{' '}
              <span className="text-[var(--text)]">vercel dev</span>. Session key is optional override
              (sessionStorage only).
            </p>
          )}
          {forgeProvider === 'local' && (
            <p className="mb-3 text-[11px] leading-snug text-[var(--muted)]">
              Local OpenAI-compatible gateway. Ollama:{' '}
              <span className="text-[var(--text)]">127.0.0.1:11434</span>. ForgeRouter:{' '}
              <span className="text-[var(--text)]">127.0.0.1:8123</span>.
            </p>
          )}
          {forgeProvider === 'custom' && !forgeUrl.trim() && (
            <p className="mb-3 text-[11px] leading-snug text-[var(--muted)]">
              Paste any OpenAI-compatible base URL (with or without trailing /v1).
            </p>
          )}
        </>
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
          disabled={llmLoading || (forgeMode === 'llm' && !llmReady)}
          aria-label="Forge unique content angles"
        >
          {llmLoading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Lightbulb size={16} aria-hidden />}
          {forgeMode === 'llm'
            ? forgeProvider === 'grok'
              ? 'Forge with Grok'
              : 'Forge with LLM'
            : 'Forge unique angles'}
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
          ? 'Forged — results kept for export · human gate below'
          : forgeMode === 'llm' && llmReady
            ? forgeProvider === 'grok'
              ? 'Grok mode — server proxy, falls back to templates on error'
              : 'LLM mode — streams from your gateway, falls back to templates on error'
            : 'Templates always work offline · export uses last forge when present'}
      </div>

      {lastForge && lastForge.angles.length > 0 && (
        <>
          <GlowDivider className="my-4" />
          <HudLabel className="mb-2 block text-xs">
            Last forge · {lastForge.source}
            {lastForge.provider ? ` · ${lastForge.provider}` : ''}
            {lastForge.model ? ` · ${lastForge.model}` : ''}
          </HudLabel>
          <div className="mb-3 max-h-48 space-y-1.5 overflow-y-auto">
            {lastForge.angles.map((angle, i) => (
              <div
                key={`${i}-${angle.slice(0, 16)}`}
                className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--input-bg)] p-2.5 text-[13px] leading-relaxed text-[var(--text)]"
              >
                <span className="mr-1.5 text-[10px] text-[var(--muted)]">{i + 1}.</span>
                {angle}
              </div>
            ))}
          </div>
          <div className="flex gap-1">
            <NeoButton
              size="xs"
              variant="ghost"
              className="flex-1"
              onClick={() => onPreference('accept')}
              aria-label="Accept forged angles for learn loop"
            >
              <Check size={12} aria-hidden /> Accept
            </NeoButton>
            <NeoButton
              size="xs"
              variant="ghost"
              className="flex-1"
              onClick={() => onPreference('edit')}
              aria-label="Mark forge as edited for learn loop"
            >
              <Pencil size={12} aria-hidden /> Edit
            </NeoButton>
            <NeoButton
              size="xs"
              variant="ghost"
              className="flex-1"
              onClick={() => onPreference('reject')}
              aria-label="Reject forged angles for learn loop"
            >
              <X size={12} aria-hidden /> Reject
            </NeoButton>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-[var(--muted)]">
            Preferences stay local (learn loop). Export downloads these durable angles.
            {preferenceCount > 0
              ? ` · ${preferenceCount} preference${preferenceCount === 1 ? '' : 's'} influence the next LLM forge.`
              : ' · Gate angles so the next LLM forge learns your taste.'}
          </p>
        </>
      )}

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
