import { describe, expect, it, beforeEach } from 'vitest'
import {
  appendPreference,
  loadLastForge,
  loadPreferences,
  preferencesToJsonl,
  saveLastForge,
  summarizePreferencesForPrompt,
  LAST_FORGE_STORAGE_KEY,
  PREFERENCES_STORAGE_KEY,
  type PreferenceEvent,
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

describe('summarizePreferencesForPrompt', () => {
  it('returns empty for no events', () => {
    expect(summarizePreferencesForPrompt([])).toBe('')
  })

  it('includes prefer / avoid / edit language from a mix of decisions', () => {
    const events: PreferenceEvent[] = [
      {
        id: '1',
        timestamp: '2026-07-25T00:00:00.000Z',
        decision: 'accept',
        topic: 'AI Agents',
        angles: ['Ship a narrow agent that does one job well'],
        source: 'llm',
      },
      {
        id: '2',
        timestamp: '2026-07-25T00:01:00.000Z',
        decision: 'reject',
        topic: 'AI Agents',
        angles: ['This will go viral overnight guaranteed'],
        source: 'llm',
      },
      {
        id: '3',
        timestamp: '2026-07-25T00:02:00.000Z',
        decision: 'edit',
        topic: 'Local models',
        angles: ['Edge is dead'],
        editedAngles: ['Edge is maturing — here is the practical play'],
        source: 'llm',
      },
    ]
    const hint = summarizePreferencesForPrompt(events)
    expect(hint).toContain('Operator taste')
    expect(hint).toContain('Prefer angles like')
    expect(hint).toContain('narrow agent')
    expect(hint).toContain('Avoid angles like')
    expect(hint).toContain('viral overnight')
    expect(hint).toContain('Human edits')
    expect(hint).toContain('maturing')
  })

  it('respects maxChars budget', () => {
    const events: PreferenceEvent[] = [
      {
        id: '1',
        timestamp: 't',
        decision: 'accept',
        topic: 't',
        angles: ['A'.repeat(200)],
        source: 'templates',
      },
      {
        id: '2',
        timestamp: 't',
        decision: 'reject',
        topic: 't',
        angles: ['B'.repeat(200)],
        source: 'templates',
      },
    ]
    const hint = summarizePreferencesForPrompt(events, 120)
    expect(hint.length).toBeLessThanOrEqual(120)
  })
})
