/** Preference flywheel for Loop L — human gates on forge output. */

export type PreferenceDecision = 'accept' | 'edit' | 'reject'

export type ForgeSource = 'templates' | 'llm' | 'llm-fallback'

export interface PreferenceEvent {
  id: string
  timestamp: string
  decision: PreferenceDecision
  topic: string
  angles: string[]
  /** Present when decision is `edit` — the human-revised angles. */
  editedAngles?: string[]
  clusterName?: string | null
  source: ForgeSource
  model?: string
  provider?: string
}

export interface LastForgeResult {
  angles: string[]
  topic: string
  clusterName: string | null
  source: ForgeSource
  model?: string
  provider?: string
  createdAt: string
}

export const PREFERENCES_STORAGE_KEY = 'trendforge-preferences'
export const LAST_FORGE_STORAGE_KEY = 'trendforge-last-forge'
export const MAX_PREFERENCE_EVENTS = 100

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function loadPreferences(): PreferenceEvent[] {
  try {
    const parsed = safeParseJson<PreferenceEvent[]>(localStorage.getItem(PREFERENCES_STORAGE_KEY))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function savePreferences(events: PreferenceEvent[]): void {
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(events.slice(0, MAX_PREFERENCE_EVENTS)))
  } catch {
    // quota / private mode
  }
}

export function appendPreference(event: Omit<PreferenceEvent, 'id' | 'timestamp'>): PreferenceEvent {
  const full: PreferenceEvent = {
    ...event,
    id: `pref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  }
  const next = [full, ...loadPreferences()].slice(0, MAX_PREFERENCE_EVENTS)
  savePreferences(next)
  return full
}

export function loadLastForge(): LastForgeResult | null {
  try {
    return safeParseJson<LastForgeResult>(localStorage.getItem(LAST_FORGE_STORAGE_KEY))
  } catch {
    return null
  }
}

export function saveLastForge(result: LastForgeResult): void {
  try {
    localStorage.setItem(LAST_FORGE_STORAGE_KEY, JSON.stringify(result))
  } catch {
    // quota / private mode
  }
}

export function clearLastForge(): void {
  try {
    localStorage.removeItem(LAST_FORGE_STORAGE_KEY)
  } catch {}
}

export function preferencesToJsonl(events: PreferenceEvent[]): string {
  return events.map(e => JSON.stringify(e)).join('\n')
}

const DEFAULT_PREF_HINT_MAX_CHARS = 520
const MAX_EXAMPLES_PER_BUCKET = 3

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

/**
 * Compress recent human gate decisions into a short operator-taste block
 * for the next LLM forge prompt. Empty when no events or nothing usable.
 */
export function summarizePreferencesForPrompt(
  events: PreferenceEvent[],
  maxChars = DEFAULT_PREF_HINT_MAX_CHARS,
): string {
  if (!events.length || maxChars <= 0) return ''

  // Prefer recent events; keep a bit of topic diversity by scanning newest-first.
  const prefer: string[] = []
  const avoid: string[] = []
  const revised: string[] = []

  for (const e of events) {
    if (prefer.length >= MAX_EXAMPLES_PER_BUCKET &&
        avoid.length >= MAX_EXAMPLES_PER_BUCKET &&
        revised.length >= MAX_EXAMPLES_PER_BUCKET) {
      break
    }

    const topic = e.topic?.trim() || e.clusterName?.trim() || ''
    const topicBit = topic ? ` (${topic})` : ''

    if (e.decision === 'accept' && prefer.length < MAX_EXAMPLES_PER_BUCKET) {
      const sample = e.angles?.[0]
      if (sample?.trim()) prefer.push(`${clip(sample, 90)}${topicBit}`)
    } else if (e.decision === 'reject' && avoid.length < MAX_EXAMPLES_PER_BUCKET) {
      const sample = e.angles?.[0]
      if (sample?.trim()) avoid.push(`${clip(sample, 90)}${topicBit}`)
    } else if (e.decision === 'edit' && revised.length < MAX_EXAMPLES_PER_BUCKET) {
      const before = e.angles?.[0]
      const after = e.editedAngles?.[0]
      if (after?.trim()) {
        if (before?.trim() && before.trim() !== after.trim()) {
          revised.push(`was "${clip(before, 50)}" → prefer "${clip(after, 70)}"${topicBit}`)
        } else {
          revised.push(`${clip(after, 90)}${topicBit}`)
        }
      }
    }
  }

  if (!prefer.length && !avoid.length && !revised.length) return ''

  const lines: string[] = [
    'Operator taste (from recent Accept / Edit / Reject — local only; follow unless it conflicts with sample posts):',
  ]
  if (prefer.length) lines.push(`Prefer angles like: ${prefer.join(' | ')}`)
  if (revised.length) lines.push(`Human edits (use these styles): ${revised.join(' | ')}`)
  if (avoid.length) lines.push(`Avoid angles like: ${avoid.join(' | ')}`)

  let out = lines.join('\n')
  if (out.length > maxChars) {
    out = `${out.slice(0, maxChars - 1)}…`
  }
  return out
}
