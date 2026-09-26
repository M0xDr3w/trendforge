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

const { default: handler } = await import('../digest.js')
const { encryptTokens } = await import('../_lib/session.js')

const realFetch = globalThis.fetch
const SECRET = 'test-session-secret-12345'

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

function req(method = 'POST', body = {}) {
  return {
    method,
    query: {},
    body,
    headers: {
      origin: 'https://app.vercel.app',
      host: 'app.vercel.app',
      cookie: 'tf_session=s1',
    },
  }
}

function seed(posts = [{ id: '1', text: 'saved words', username: 's', createdAt: '2026-09-20T00:00:00.000Z' }]) {
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
  kvStore._hashes.set('tf:bm:u1', Object.fromEntries(posts.map(p => [p.id, p])))
}

function mockBrief(text = '## Brief\n- idea (via [@s])') {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: text } }] }),
  })
}

beforeEach(() => {
  kvStore = memKv()
  process.env.SESSION_SECRET = SECRET
  process.env.XAI_API_KEY = 'xai-test'
  process.env.KV_REST_API_URL = 'https://kv.example'
  process.env.KV_REST_API_TOKEN = 'kv-token'
  delete process.env.DIGEST_SESS_PER_HOUR
  delete process.env.APP_ACCESS_TOKEN
  delete process.env.X_ALLOWED_USER_IDS
  globalThis.fetch = realFetch
})

describe('digest POST', () => {
  it('generates, stores, and returns the brief', async () => {
    seed()
    mockBrief()
    const res = resMock()
    await handler(req(), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.text).toContain('## Brief')
    expect(res.body.model).toBe('grok-4.5')
    expect(await kvStore.get('tf:digest:u1:latest')).toMatchObject({ postCount: 1 })
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects a disallowed explicit model without calling xAI', async () => {
    seed()
    mockBrief()
    const res = resMock()
    await handler(req('POST', { model: 'gpt-5' }), res)
    expect(res.statusCode).toBe(400)
    expect(res.body.code).toBe('invalid_model')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('rate-limits generation per session', async () => {
    process.env.DIGEST_SESS_PER_HOUR = '1'
    seed()
    mockBrief()
    const first = resMock()
    await handler(req(), first)
    expect(first.statusCode).toBe(200)
    const second = resMock()
    await handler(req(), second)
    expect(second.statusCode).toBe(429)
    expect(second.body.code).toBe('digest_rate_limit')
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('returns 500 when the digest store fails', async () => {
    kvStore = memKv(k => k === 'tf:digest:u1:latest')
    seed()
    mockBrief()
    const res = resMock()
    await handler(req(), res)
    expect(res.statusCode).toBe(500)
    expect(res.body.code).toBe('digest_store_failed')
  })
})

describe('digest GET', () => {
  it('returns the stored brief and 404s when missing', async () => {
    seed()
    const missing = resMock()
    await handler(req('GET'), missing)
    expect(missing.statusCode).toBe(404)
    expect(missing.body.code).toBe('digest_missing')
    kvStore.store.set('tf:digest:u1:latest', { text: 'old', createdAt: 'x', postCount: 1 })
    const hit = resMock()
    await handler(req('GET'), hit)
    expect(hit.statusCode).toBe(200)
    expect(hit.body.text).toBe('old')
  })
})

describe('owner-only lock on paid routes', () => {
  it('returns 403 for a session whose id is no longer allowed', async () => {
    process.env.X_ALLOWED_USER_IDS = '42'
    seed()
    // Session belongs to u1, which is not on the list.
    mockBrief()
    const res = resMock()
    await handler(req(), res)
    expect(res.statusCode).toBe(403)
    expect(res.body.code).toBe('user_not_allowed')
    expect(globalThis.fetch).not.toHaveBeenCalled()
    delete process.env.X_ALLOWED_USER_IDS
  })

  it('lets the listed owner through', async () => {
    process.env.X_ALLOWED_USER_IDS = 'u1'
    seed()
    mockBrief()
    const res = resMock()
    await handler(req(), res)
    expect(res.statusCode).toBe(200)
    delete process.env.X_ALLOWED_USER_IDS
  })
})
