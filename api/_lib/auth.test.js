import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map()

vi.mock('@vercel/kv', () => ({
  kv: {
    async get(k) {
      return store.has(k) ? store.get(k) : null
    },
    async set(k, v, opts) {
      if (opts?.nx && store.has(k)) return null
      store.set(k, v)
      return 'OK'
    },
    async del(k) {
      store.delete(k)
    },
  },
}))

const { loadSession, refreshSessionTokens } = await import('./auth.js')
const { encryptTokens } = await import('./session.js')

const SECRET = 'test-session-secret-12345'
const SID = 'sess-abc'
const SESSION_KEY = `tf:sess:${SID}`
const LOCK_KEY = `tf:refresh-lock:${SID}`

const realFetch = globalThis.fetch

function bundle(over = {}) {
  return {
    accessToken: 'old-at',
    refreshToken: 'rt',
    expiresAt: Date.now() - 1000,
    xUserId: '42',
    username: 'tester',
    gen: 1,
    ...over,
  }
}

function seal(b) {
  return encryptTokens(SECRET, b)
}

beforeEach(() => {
  store.clear()
  process.env.X_CLIENT_ID = 'cid'
  process.env.X_CLIENT_SECRET = 'csecret'
  globalThis.fetch = realFetch
})

describe('refreshSessionTokens', () => {
  it('refreshes once and bumps the generation', async () => {
    store.set(SESSION_KEY, seal(bundle()))
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new-at', refresh_token: 'new-rt', expires_in: 7200 }),
    })
    const result = await refreshSessionTokens({ sid: SID, secret: SECRET, bundle: bundle() })
    expect(result.refreshed).toBe(true)
    expect(result.bundle.accessToken).toBe('new-at')
    expect(result.bundle.gen).toBe(2)
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(store.has(LOCK_KEY)).toBe(false)
  })

  it('lock loser adopts the winner result without its own refresh', async () => {
    store.set(LOCK_KEY, 'winner-holds-it')
    store.set(SESSION_KEY, seal(bundle({ accessToken: 'winner-at', gen: 2 })))
    globalThis.fetch = vi.fn()
    const result = await refreshSessionTokens({ sid: SID, secret: SECRET, bundle: bundle() })
    expect(result.refreshed).toBe(true)
    expect(result.bundle.accessToken).toBe('winner-at')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('destroys the session only on positive revocation (400)', async () => {
    store.set(SESSION_KEY, seal(bundle()))
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant' }),
    })
    const result = await refreshSessionTokens({ sid: SID, secret: SECRET, bundle: bundle() })
    expect(result).toMatchObject({ ok: false, code: 'session_expired' })
    expect(store.has(SESSION_KEY)).toBe(false)
  })

  it('keeps the stale session on transient refresh failure', async () => {
    store.set(SESSION_KEY, seal(bundle()))
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    const result = await refreshSessionTokens({ sid: SID, secret: SECRET, bundle: bundle() })
    expect(result.refreshed).toBe(false)
    expect(result.bundle.accessToken).toBe('old-at')
    expect(store.has(SESSION_KEY)).toBe(true)
  })
})

describe('loadSession', () => {
  it('returns a fresh session without refreshing', async () => {
    process.env.SESSION_SECRET = SECRET
    store.set(SESSION_KEY, seal(bundle({ expiresAt: Date.now() + 3600_000 })))
    globalThis.fetch = vi.fn()
    const result = await loadSession({ headers: { cookie: `tf_session=${SID}` } })
    expect(result.ok).toBe(true)
    expect(result.bundle.username).toBe('tester')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
