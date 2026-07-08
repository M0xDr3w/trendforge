import type { SavedRadar } from './types'

const STORAGE_KEY = 'trendforge-radars'

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function seedDefaultRadars(defaultQueries: string[], maxRadars: number): SavedRadar[] {
  const now = new Date().toISOString()
  return defaultQueries.slice(0, maxRadars).map(query => ({
    id: newId(),
    name: query.length > 28 ? `${query.slice(0, 25)}…` : query,
    query,
    createdAt: now,
  }))
}

export function loadRadars(defaultQueries: string[], maxRadars: number): SavedRadar[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed) && parsed.every(isSavedRadar)) {
        return parsed.slice(0, maxRadars)
      }
    }
  } catch {}

  const seeded = seedDefaultRadars(defaultQueries, maxRadars)
  saveRadars(seeded)
  return seeded
}

export function saveRadars(radars: SavedRadar[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(radars))
  } catch {}
}

function isSavedRadar(value: unknown): value is SavedRadar {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return (
    typeof r.id === 'string' &&
    typeof r.name === 'string' &&
    typeof r.query === 'string' &&
    typeof r.createdAt === 'string' &&
    (r.lastSynced === undefined || typeof r.lastSynced === 'string')
  )
}

export function addRadar(
  radars: SavedRadar[],
  name: string,
  query: string,
  maxRadars: number,
): { radars: SavedRadar[]; error?: string } {
  const trimmedName = name.trim()
  const trimmedQuery = query.trim()
  if (!trimmedName) return { radars, error: 'Name is required' }
  if (!trimmedQuery) return { radars, error: 'Query is required' }
  if (radars.length >= maxRadars) {
    return { radars, error: `Maximum ${maxRadars} saved radars` }
  }
  if (radars.some(r => r.query.toLowerCase() === trimmedQuery.toLowerCase())) {
    return { radars, error: 'That query is already saved' }
  }

  const radar: SavedRadar = {
    id: newId(),
    name: trimmedName,
    query: trimmedQuery,
    createdAt: new Date().toISOString(),
  }
  return { radars: [...radars, radar] }
}

export function deleteRadar(radars: SavedRadar[], id: string): SavedRadar[] {
  return radars.filter(r => r.id !== id)
}

export function updateRadarLastSynced(radars: SavedRadar[], id: string, at = new Date().toISOString()): SavedRadar[] {
  return radars.map(r => (r.id === id ? { ...r, lastSynced: at } : r))
}

export function formatLastSynced(iso?: string): string {
  if (!iso) return 'Never synced'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Never synced'
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
