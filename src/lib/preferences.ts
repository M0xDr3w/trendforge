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
