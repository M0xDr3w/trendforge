import { describe, expect, it, beforeEach } from 'vitest'
import {
  appendPreference,
  loadLastForge,
  loadPreferences,
  preferencesToJsonl,
  saveLastForge,
  LAST_FORGE_STORAGE_KEY,
  PREFERENCES_STORAGE_KEY,
} from './preferences'

class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string) {
    this.store.set(key, value)
  }
  removeItem(key: string) {
    this.store.delete(key)
  }
  clear() {
    this.store.clear()
  }
}

describe('preferences', () => {
  beforeEach(() => {
    const mem = new MemoryStorage()
    // @ts-expect-error test shim
    globalThis.localStorage = mem
  })

  it('appends preference events newest first', () => {
    appendPreference({
      decision: 'accept',
      topic: 'AI Agents',
      angles: ['Hook one'],
      source: 'templates',
    })
    appendPreference({
      decision: 'reject',
      topic: 'AI Agents',
      angles: ['Hook two'],
      source: 'llm',
      model: 'grok-4.5',
      provider: 'grok',
    })
    const events = loadPreferences()
    expect(events).toHaveLength(2)
    expect(events[0].decision).toBe('reject')
    expect(events[0].model).toBe('grok-4.5')
    expect(events[1].decision).toBe('accept')
  })

  it('persists last forge result', () => {
    saveLastForge({
      angles: ['a', 'b'],
      topic: 'X & Grok',
      clusterName: 'X & Grok',
      source: 'llm',
      provider: 'grok',
      model: 'grok-4.5',
      createdAt: '2026-07-09T00:00:00.000Z',
    })
    const last = loadLastForge()
    expect(last?.angles).toEqual(['a', 'b'])
    expect(last?.provider).toBe('grok')
    expect(localStorage.getItem(LAST_FORGE_STORAGE_KEY)).toContain('X & Grok')
  })

  it('exports preferences as jsonl', () => {
    appendPreference({
      decision: 'edit',
      topic: 't',
      angles: ['old'],
      editedAngles: ['new'],
      source: 'llm-fallback',
    })
    const lines = preferencesToJsonl(loadPreferences()).split('\n')
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]).editedAngles).toEqual(['new'])
    expect(localStorage.getItem(PREFERENCES_STORAGE_KEY)).toBeTruthy()
  })
})
