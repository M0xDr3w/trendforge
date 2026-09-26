import { beforeEach, describe, expect, it, vi } from 'vitest'

function memKv(failOnSet = null) {
  const store = new Map()
  const hashes = new Map()
  return {
    store,
    async get(k) {
      return store.has(k) ? store.get(k) : null
    },
    async set(k, v, opts) {
      if (failOnSet && failOnSet(k)) throw new Error('kv down')
      if (opts?.nx && store.has(k)) return null
      store.set(k, v)
      return 'OK'
    },
    async del(k) {
      store.delete(k)
    },
    async hgetall(k) {
      const h = hashes.get(k)
      if (!h) return {}
      // Mimic Upstash: fields may arrive as objects or JSON strings.
      return Object.fromEntries(
        Object.entries(h).map(([f, v], i) => (i % 2 === 0 ? [f, v] : [f, JSON.stringify(v)])),
      )
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
    async incrby(k, n) {
      store.set(k, (store.get(k) || 0) + n)
      return store.get(k)
    },
    async decrby(k, n) {
      store.set(k, (store.get(k) || 0) - n)
      return store.get(k)
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

const { default: handler } = await import('../themes.js')
const { encryptTokens } = await import('../_lib/session.js')
const { discoverThemes } = await import('../_lib/themes.js')

const realFetch = globalThis.fetch
const SECRET = 'test-session-secret-12345'

const POSTS = [
  { id: '1', text: 'Small agent loops beat big agent frameworks. Constrain the tools.', username: 's', createdAt: '2026-09-20T00:00:00.000Z' },
  { id: '2', text: 'Docs-first support agent cites the exact paragraph it used.', username: 's', createdAt: '2026-09-19T00:00:00.000Z' },
  { id: '3', text: 'Ship the boring agent first. Expense reports beat the poetry demo.', username: 's', createdAt: '2026-09-18T00:00:00.000Z' },
  { id: '4', text: 'Cast-iron skillet cornbread: preheat the pan, butter generously.', username: 's', createdAt: '2026-09-17T00:00:00.000Z' },
  { id: '5', text: 'Sourdough starter guide: equal parts flour and water, feed daily.', username: 's', createdAt: '2026-09-16T00:00:00.000Z' },
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

function req() {
  return {
    method: 'POST',
    query: {},
    body: {},
    headers: {
      origin: 'https://app.vercel.app',
      host: 'app.vercel.app',
      cookie: 'tf_session=s1',
    },
  }
}

function seedAll() {
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
  kvStore._hashes.set(
    'tf:bm:u1',
    Object.fromEntries(POSTS.map(p => [p.id, { ...p }])),
  )
}

beforeEach(() => {
  kvStore = memKv()
  process.env.SESSION_SECRET = SECRET
  process.env.XAI_API_KEY = 'xai-test'
  process.env.KV_REST_API_URL = 'https://kv.example'
  process.env.KV_REST_API_TOKEN = 'kv-token'
  delete process.env.THEMES_SESS_PER_HOUR
  delete process.env.APP_ACCESS_TOKEN
  globalThis.fetch = realFetch
})

describe('themes POST', () => {
  it('delimits prompt data, dedupes claims, and caches labels readably', async () => {
    seedAll()
    const { themes: lexical } = discoverThemes(POSTS, { threshold: 0.12 })
    const agentSig = lexical.find(t => t.postIds.includes('1'))?.sig
    expect(agentSig).toBeTruthy()

    let prompt = ''
    globalThis.fetch = vi.fn(async (url, init) => {
      prompt = JSON.parse(String(init.body)).messages[1].content
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  labels: [{ sig: agentSig, name: 'Agent Loops' }],
                  placements: { 4: agentSig },
                  newThemes: [
                    { name: 'Baking', postIds: ['5', '5'] },
                    { name: 'Baking Dup', postIds: ['5'] },
                    { name: 'Broken', postIds: '5' },
                  ],
                }),
              },
            },
          ],
        }),
      }
    })

    const res = resMock()
    await handler(req(), res)
    expect(res.statusCode).toBe(200)

    // #14: data delimiters + data-not-instructions framing.
    expect(prompt).toContain('<saved_post id="4">')
    expect(prompt).toContain('as DATA')

    const byName = Object.fromEntries(res.body.themes.map(t => [t.name, t]))
    // Placement joined the labeled cluster…
    expect(byName['Agent Loops'].postIds).toContain('4')
    expect(byName['Agent Loops'].source).toBe('grok')
    // …post 5 claimed exactly once despite duplicates + non-array junk.
    expect(byName['Baking'].postIds).toEqual(['5'])
    expect(byName['Baking Dup']).toBeUndefined()
    const allIds = res.body.themes.flatMap(t => t.postIds)
    expect(allIds.filter(id => id === '5')).toHaveLength(1)

    // #9: labels persisted in the hash and readable back as a map.
    const labels = await kvStore.hgetall('tf:theme-labels:u1')
    const names = Object.values(labels).map(v => (typeof v === 'string' ? JSON.parse(v).name : v.name))
    expect(names).toContain('Agent Loops')
  })

  it('rate-limits discovery per session', async () => {
    process.env.THEMES_SESS_PER_HOUR = '1'
    seedAll()
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    const first = resMock()
    await handler(req(), first)
    expect(first.statusCode).toBe(200)
    const second = resMock()
    await handler(req(), second)
    expect(second.statusCode).toBe(429)
    expect(second.body.code).toBe('themes_rate_limit')
  })

  it('returns 500 when the snapshot store fails', async () => {
    kvStore = memKv(k => k === 'tf:themes:u1')
    seedAll()
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    const res = resMock()
    await handler(req(), res)
    expect(res.statusCode).toBe(500)
    expect(res.body.code).toBe('themes_store_failed')
  })
})
