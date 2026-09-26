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
      hashes.delete(k)
    },
    async hkeys(k) {
      return Object.keys(hashes.get(k) || {})
    },
    async hgetall(k) {
      return hashes.get(k) || {}
    },
    async hset(k, obj) {
      hashes.set(k, { ...(hashes.get(k) || {}), ...obj })
      return 1
    },
    pipeline() {
      const api = {
        hset: (k, obj) => {
          hashes.set(k, { ...(hashes.get(k) || {}), ...obj })
          return api
        },
        exec: async () => [],
      }
      return api
    },
    async incrby(k, n) {
      store.set(k, (store.get(k) || 0) + n)
      return store.get(k)
    },
    async decrby(k, n) {
      store.set(k, (store.get(k) || 0) - n)
      return store.get(k)
    },
    async incr(k) {
      store.set(k, (store.get(k) || 0) + 1)
      return store.get(k)
    },
    async expire() {
      return 1
    },
  }
}

let kvStore
vi.mock('@vercel/kv', () => ({
  get kv() {
    return kvStore
  },
}))

const { default: handler } = await import('./bookmarks-sync.js')
const { encryptTokens } = await import('./_lib/session.js')
const { monthKey } = await import('./_lib/spend.js')

const realFetch = globalThis.fetch
const SECRET = 'test-session-secret-12345'

function tweet(id) {
  return {
    id,
    text: `saved post ${id}`,
    author_id: 'u9',
    created_at: '2026-09-20T00:00:00.000Z',
    public_metrics: { like_count: 1, retweet_count: 0 },
  }
}

function bookmarksPage(ids, nextToken) {
  return {
    data: ids.map(tweet),
    includes: { users: [{ id: 'u9', username: 'sample_tester' }] },
    meta: { result_count: ids.length, ...(nextToken ? { next_token: nextToken } : {}) },
  }
}

function mockX({ pages, folders = [{ id: 'f1', name: 'Later' }] }) {
  const calls = { bookmarks: 0 }
  globalThis.fetch = vi.fn(async url => {
    const u = String(url)
    if (u.includes('/bookmarks/folders') && !u.includes('/folders/')) {
      return { ok: true, json: async () => ({ data: folders }) }
    }
    const page = pages[Math.min(calls.bookmarks, pages.length - 1)]
    calls.bookmarks += 1
    return { ok: true, json: async () => page }
  })
  return calls
}

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

function req() {
  return {
    method: 'POST',
    query: {},
    headers: {
      origin: 'https://app.vercel.app',
      host: 'app.vercel.app',
      cookie: 'tf_session=s1',
    },
  }
}

function seedSession() {
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
}

beforeEach(() => {
  kvStore = memKv()
  process.env.SESSION_SECRET = SECRET
  process.env.X_CLIENT_ID = 'cid'
  process.env.X_CLIENT_SECRET = 'csecret'
  process.env.KV_REST_API_URL = 'https://kv.example'
  process.env.KV_REST_API_TOKEN = 'kv-token'
  process.env.X_SPEND_CAP_USD = '20'
  delete process.env.X_BOOKMARK_COST_USD
  delete process.env.X_USER_OWNS_APP
  delete process.env.SYNC_SESS_PER_HOUR
  delete process.env.APP_ACCESS_TOKEN
  globalThis.fetch = realFetch
})

describe('bookmarks-sync', () => {
  it('persists new posts and charges actuals including the folder read', async () => {
    seedSession()
    mockX({ pages: [bookmarksPage(['1', '2'], null)] })
    const res = resMock()
    await handler(req(), res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ ok: true, fetched: 2, newPosts: 2, total: 2, capReached: false })
    expect(res.body.folders).toBe(1)
    // 2 posts + 1 folder read at $0.001 → ceil(3 * 0.001 * 100) = 1 cent
    expect(await kvStore.get(monthKey())).toBe(1)
    const hash = await kvStore.hgetall('tf:bm:u1')
    expect(Object.keys(hash).sort()).toEqual(['1', '2'])
  })

  it('rate-limits syncs per session', async () => {
    process.env.SYNC_SESS_PER_HOUR = '1'
    seedSession()
    mockX({ pages: [bookmarksPage(['1'], null)] })
    const first = resMock()
    await handler(req(), first)
    expect(first.statusCode).toBe(200)
    const second = resMock()
    await handler(req(), second)
    expect(second.statusCode).toBe(429)
    expect(second.body.code).toBe('sync_rate_limit')
  })

  it('refuses before fetching when the remaining budget is short', async () => {
    process.env.X_SPEND_CAP_USD = '0.1'
    seedSession()
    const calls = mockX({ pages: [bookmarksPage(['1'], null)] })
    const res = resMock()
    await handler(req(), res)
    expect(res.statusCode).toBe(402)
    expect(res.body.code).toBe('spend_cap')
    expect(calls.bookmarks).toBe(0)
  })

  it('concurrent syncs persist everything and flag the over-cap one', async () => {
    process.env.X_BOOKMARK_COST_USD = '0.01'
    process.env.X_SPEND_CAP_USD = '6'
    seedSession()
    // Every bookmarks call returns a full 100-post page with a next token,
    // so each handler fetches MAX_PAGES×100 = 500 reads (501 with folders).
    // Seed 99¢ of 600¢: both preflights see 99 + 501 ≤ 600; the forces land
    // at 600 (ok) then 1101 (flagged). Nothing is dropped either way.
    kvStore.store.set(monthKey(), 99)
    const ids = Array.from({ length: 100 }, (_, i) => `p${i}`)
    globalThis.fetch = vi.fn(async url => {
      const u = String(url)
      if (u.includes('/bookmarks/folders') && !u.includes('/folders/')) {
        return { ok: true, json: async () => ({ data: [] }) }
      }
      return { ok: true, json: async () => bookmarksPage(ids, 'tok') }
    })
    const a = resMock()
    const b = resMock()
    await Promise.all([handler(req(), a), handler(req(), b)])
    expect(a.statusCode).toBe(200)
    expect(b.statusCode).toBe(200)
    const flags = [a.body.capReached, b.body.capReached].sort()
    expect(flags).toEqual([false, true])
    // Nothing dropped: the 100 distinct posts persisted exactly once…
    const hash = await kvStore.hgetall('tf:bm:u1')
    expect(Object.keys(hash)).toHaveLength(100)
    // …and every actual read recorded: 99 + 501 + 501.
    expect(await kvStore.get(monthKey())).toBe(99 + 501 + 501)
  })
})
