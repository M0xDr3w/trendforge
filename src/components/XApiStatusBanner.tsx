import { ExternalLink, X } from 'lucide-react'
import type { XApiError } from '../lib/xApiErrors'
import { getXApiRemediation } from '../lib/xApiErrors'
import { NeoButton, Panel } from './ui'

interface XApiStatusBannerProps {
  error: XApiError
  onDismiss: () => void
  onRetryTest: () => void
}

export function XApiStatusBanner({ error, onDismiss, onRetryTest }: XApiStatusBannerProps) {
  const remediation = getXApiRemediation(error)

  return (
    <Panel
      padding="md"
      className="mb-6 border border-red-500/40 bg-red-950/20"
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-sm font-semibold text-red-300">{error.message}</div>
          <p className="mb-3 text-sm text-[var(--text)]">{error.hint}</p>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-[var(--muted)]">
            {remediation.steps.map(step => (
              <li key={step} className="leading-snug">
                {step}
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap gap-2">
            <NeoButton size="xs" variant="accent" onClick={onRetryTest}>
              Test connection
            </NeoButton>
            {remediation.link && (
              <a
                href={remediation.link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--cyan)] hover:border-[var(--cyan)]"
              >
                {remediation.link.label}
                <ExternalLink size={12} aria-hidden />
              </a>
            )}
          </div>
        </div>
        <NeoButton size="xs" variant="ghost" onClick={onDismiss} aria-label="Dismiss X API error banner">
          <X size={14} aria-hidden />
        </NeoButton>
      </div>
    </Panel>
  )
}
