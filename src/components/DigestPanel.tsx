import { MailX, Newspaper, Sparkles } from 'lucide-react'
import type { WeeklyDigest } from '../lib/bookmarks'
import { HudLabel, NeoButton, Panel } from './ui'

interface DigestPanelProps {
  digest: WeeklyDigest | null
  loading: boolean
  demoMode: boolean
  canGenerate: boolean
  onGenerate: () => void
}

export function DigestPanel({ digest, loading, demoMode, canGenerate, onGenerate }: DigestPanelProps) {
  return (
    <Panel padding="md">
      <div className="mb-1 flex items-center justify-between gap-2">
        <HudLabel className="flex items-center gap-2 text-xs">
          <Newspaper size={14} aria-hidden /> Weekly brief
        </HudLabel>
        {demoMode && (
          <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-amber-300">
            DEMO FIXTURES
          </span>
        )}
      </div>
      <p className="mb-3 text-sm text-[var(--muted)]">
        A Grok digest of new bookmarks — refreshes every Monday via cron.
      </p>

      {digest ? (
        <div className="max-h-[380px] space-y-2 overflow-auto rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--input-bg)] p-3 text-[13px] leading-relaxed">
          <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
            <Sparkles size={12} aria-hidden />
            {new Date(digest.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            <span>· {digest.postCount} saves</span>
            {digest.model && <span>· {digest.model}</span>}
          </div>
          {digest.text.split('\n').map((line, i) => {
            const trimmed = line.trim()
            if (trimmed.startsWith('## ')) {
              return <h4 key={i} className="pt-1 text-sm font-semibold text-[var(--text)]">{trimmed.slice(3)}</h4>
            }
            if (!trimmed) return <div key={i} className="h-1" />
            return <p key={i} className="text-[var(--text)]">{line}</p>
          })}
        </div>
      ) : (
        <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted)]">
          No digest yet. Sync bookmarks, then generate the first brief.
        </p>
      )}

      <NeoButton
        size="sm"
        variant={digest ? 'ghost' : 'accent'}
        fullWidth
        className="mt-3"
        disabled={loading || !canGenerate}
        onClick={onGenerate}
        title={canGenerate ? 'Generate with Grok' : 'Sign in and sync first (or use demo mode)'}
        aria-label="Generate weekly digest"
      >
        {loading ? 'Generating…' : digest ? 'Regenerate brief' : 'Generate brief'}
      </NeoButton>
      <p className="mt-1 flex items-center justify-center gap-1 text-center text-[10px] text-[var(--muted)]">
        <MailX size={10} aria-hidden /> In-app only — emailing is out of scope
      </p>
    </Panel>
  )
}
