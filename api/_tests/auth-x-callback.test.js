import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = new Map()

vi.mock('@vercel/kv', () => ({
  kv: {
    async get(k) {
      return store.has(k) ? store.get(k) : null
    },
    async set(k, v) {
      store.set(k, v)
      return 'OK'
    },
    async del(k) {
      store.delete(k)
    },
  },
}))

const { default: handler } = await import('../auth/x-callback.js')

const realFetch = globalThis.fetch

function resMock() {
  const res = {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      res.statusCode = code
      return res
    },
    json(payload) {
      res.body = payload
      return res
    },
    setHeader(name, value) {
      res.headers[name] = value
    },
    redirect(code, location) {
      res.statusCode = code
      res.headers.location = location
    },
  }
  return res
}

beforeEach(() => {
  store.clear()
  process.env.SESSION_SECRET = 'test-session-secret-12345'
  process.env.X_CLIENT_ID = 'cid'
  process.env.X_CLIENT_SECRET = 'csecret'
  delete process.env.X_ALLOWED_USER_IDS
  globalThis.fetch = realFetch
})

describe('x-callback session fixation', () => {
  it('mints a fresh session and destroys a pre-login one', async () => {
    store.set('tf:pkce:state-1', { verifier: 'verifier-1', redirectUri: 'https://app.vercel.app/api/auth/x-callback' })
    store.set('tf:sess:planted-sid', { planted: true })
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'at', refresh_token: 'rt', expires_in: 7200 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: '42', username: 'tester' } }),
      })

    const res = resMock()
    await handler(
      {
        query: { code: 'code-1', state: 'state-1' },
        headers: { host: 'app.vercel.app', cookie: 'tf_session=planted-sid' },
      },
      res,
    )

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('https://app.vercel.app/?auth=ok')
    const cookie = String(res.headers['Set-Cookie'] || '')
    const sid = decodeURIComponent(cookie.match(/tf_session=([^;]+)/)?.[1] || '')
    expect(sid).toBeTruthy()
    expect(sid).not.toBe('planted-sid')
    expect(store.has('tf:sess:planted-sid')).toBe(false)
    expect(store.has(`tf:sess:${sid}`)).toBe(true)
    expect(store.has('tf:pkce:state-1')).toBe(false)
  })

  it('lets a listed id through while the lock is on', async () => {
    process.env.X_ALLOWED_USER_IDS = '42'
    store.set('tf:pkce:state-2', { verifier: 'verifier-2', redirectUri: 'https://app.vercel.app/api/auth/x-callback' })
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'at', refresh_token: 'rt', expires_in: 7200 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: '42', username: 'owner' } }),
      })

    const res = resMock()
    await handler(
      {
        query: { code: 'code-2', state: 'state-2' },
        headers: { host: 'app.vercel.app' },
      },
      res,
    )

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('https://app.vercel.app/?auth=ok')
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('refuses an unlisted id: no session, no tokens, revoke attempted', async () => {
    process.env.X_ALLOWED_USER_IDS = '42'
    store.set('tf:pkce:state-3', { verifier: 'verifier-3', redirectUri: 'https://app.vercel.app/api/auth/x-callback' })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'at-intruder', refresh_token: 'rt-intruder', expires_in: 7200 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: '777', username: 'intruder' } }),
      })
      .mockResolvedValue({ ok: true, json: async () => ({}) })
    globalThis.fetch = fetchMock

    const res = resMock()
    await handler(
      {
        query: { code: 'code-3', state: 'state-3' },
        headers: { host: 'app.vercel.app' },
      },
      res,
    )

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('https://app.vercel.app/?auth=private')
    expect(res.headers['Set-Cookie'] || '').toContain('Max-Age=0')
    // Token exchange + users/me + best-effort revoke of both tokens.
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(JSON.stringify(fetchMock.mock.calls)).toContain('oauth2/revoke')
    // Nothing session-shaped persisted.
    const sessionKeys = [...store.keys()].filter(k => k.startsWith('tf:sess:'))
    expect(sessionKeys).toEqual([])
  })
})
