import { beforeEach, describe, expect, it, vi } from 'vitest'

function memKv() {
  const store = new Map()
  const hashes = new Map()
  return {
    store,
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
    async hgetall(k) {
      return hashes.get(k) || {}
    },
    async hset(k, obj) {
      hashes.set(k, { ...(hashes.get(k) || {}), ...obj })
      return 1
    },
    async hkeys(k) {
      return Object.keys(hashes.get(k) || {})
    },
    async incr(k) {
      store.set(k, (store.get(k) || 0) + 1)
      return store.get(k)
    },
    async expire() {
      return 1
    },
    _hashes: hashes,
  }
}

let kvStore
vi.mock('@vercel/kv', () => ({
  get kv() {
    return kvStore
  },
}))

const { default: handler } = await import('./bookmarks.js')
const { encryptTokens } = await import('./_lib/session.js')

const realFetch = globalThis.fetch
const SECRET = 'test-session-secret-12345'

const POSTS = [
  { id: '1', text: 'agent loops and tools', username: 'sample_a', createdAt: '2026-09-20T00:00:00.000Z' },
  { id: '2', text: 'sourdough starter guide', username: 'sample_b', createdAt: '2026-09-19T00:00:00.000Z' },
  { id: '3', text: 'agent frameworks compared', username: 'sample_a', createdAt: '2026-09-18T00:00:00.000Z' },
]

function resMock() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      res.statusCode = code
      return res
    },
    json(payload) {
      res.body = payload
      return res
    },
  }
  return res
}

function req(query = {}) {
  return {
    method: 'GET',
    query,
    headers: {
      origin: 'https://app.vercel.app',
      host: 'app.vercel.app',
      cookie: 'tf_session=s1',
    },
  }
}

function seed() {
  kvStore.store.set(
    'tf:sess:s1',
    encryptTokens(SECRET, {
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 3600_000,
      xUserId: 'u1',
      username: 'tester',
      gen: 0,
    }),
  )
  kvStore._hashes.set('tf:bm:u1', Object.fromEntries(POSTS.map(p => [p.id, p])))
}

beforeEach(() => {
  kvStore = memKv()
  process.env.SESSION_SECRET = SECRET
  process.env.XAI_API_KEY = 'xai-test'
  process.env.KV_REST_API_URL = 'https://kv.example'
  process.env.KV_REST_API_TOKEN = 'kv-token'
  delete process.env.BOOKMARKS_ASK_SESS_PER_HOUR
  delete process.env.APP_ACCESS_TOKEN
  globalThis.fetch = realFetch
})

describe('bookmarks GET', () => {
  it('filters by keyword without spending xAI', async () => {
    seed()
    globalThis.fetch = vi.fn()
    const res = resMock()
    await handler(req({ q: 'agent' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.posts.map(p => p.id).sort()).toEqual(['1', '3'])
    expect(res.body.assisted).toBe(false)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('ranks with Grok when asked', async () => {
    seed()
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '["2", "1"]' } }] }),
    })
    const res = resMock()
    await handler(req({ ask: 'baking' }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.assisted).toBe(true)
    expect(res.body.posts.map(p => p.id)).toEqual(['2', '1'])
  })

  it('rate-limits assisted search per session', async () => {
    process.env.BOOKMARKS_ASK_SESS_PER_HOUR = '1'
    seed()
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '["1"]' } }] }),
    })
    const first = resMock()
    await handler(req({ ask: 'q' }), first)
    expect(first.statusCode).toBe(200)
    const second = resMock()
    await handler(req({ ask: 'q' }), second)
    expect(second.statusCode).toBe(429)
    expect(second.body.code).toBe('ask_rate_limit')
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('needs XAI_API_KEY for assisted search', async () => {
    delete process.env.XAI_API_KEY
    seed()
    const res = resMock()
    await handler(req({ ask: 'q' }), res)
    expect(res.statusCode).toBe(503)
    expect(res.body.code).toBe('missing_xai_key')
  })
})
