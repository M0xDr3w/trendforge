import { beforeEach, describe, expect, it } from 'vitest'
import {
  checkAppToken,
  checkRateLimit,
  clampMaxTokens,
  clampTemperature,
  getAllowedModels,
  getClientIp,
  isAllowedOrigin,
  resolveForgeModel,
  validateMessages,
} from './guard.js'

function req(headers = {}, query = {}) {
  return { headers, query }
}

beforeEach(() => {
  delete process.env.APP_ACCESS_TOKEN
  delete process.env.APP_ORIGIN
  delete process.env.FORGE_ALLOWED_MODELS
  delete process.env.FORGE_MAX_TOKENS
})

describe('isAllowedOrigin', () => {
  it('allows matching Origin against the request host', () => {
    const r = req(
      { origin: 'https://trendforge-opal.vercel.app', host: 'trendforge-opal.vercel.app' },
    )
    expect(isAllowedOrigin(r)).toBe(true)
  })

  it('allows matching Referer when Origin is absent', () => {
    const r = req(
      { referer: 'https://trendforge-opal.vercel.app/some/path', host: 'trendforge-opal.vercel.app' },
    )
    expect(isAllowedOrigin(r)).toBe(true)
  })

  it('rejects bare curl with no Origin or Referer', () => {
    expect(isAllowedOrigin(req({ host: 'trendforge-opal.vercel.app' }))).toBe(false)
  })

  it('rejects third-party origins', () => {
    const r = req({ origin: 'https://evil.example', host: 'trendforge-opal.vercel.app' })
    expect(isAllowedOrigin(r)).toBe(false)
  })

  it('honors x-forwarded-host behind Vercel', () => {
    const r = req({
      origin: 'https://my-preview.vercel.app',
      'x-forwarded-host': 'my-preview.vercel.app',
      host: 'internal',
    })
    expect(isAllowedOrigin(r)).toBe(true)
  })

  it('honors APP_ORIGIN override list', () => {
    process.env.APP_ORIGIN = 'https://trendforge-opal.vercel.app, https://preview.example'
    expect(
      isAllowedOrigin(req({ origin: 'https://preview.example', host: 'other.internal' })),
    ).toBe(true)
    expect(
      isAllowedOrigin(req({ origin: 'https://evil.example', host: 'other.internal' })),
    ).toBe(false)
  })
})

describe('checkAppToken', () => {
  it('passes open when APP_ACCESS_TOKEN is unset', () => {
    expect(checkAppToken(req())).toBe(true)
  })

  it('requires the matching token via header or query when set', () => {
    process.env.APP_ACCESS_TOKEN = 'owner-secret'
    expect(checkAppToken(req())).toBe(false)
    expect(checkAppToken(req({ 'x-app-token': 'wrong' }))).toBe(false)
    expect(checkAppToken(req({ 'x-app-token': 'owner-secret' }))).toBe(true)
    expect(checkAppToken(req({}, { app_token: 'owner-secret' }))).toBe(true)
  })
})

describe('getClientIp', () => {
  it('prefers the first x-forwarded-for entry', () => {
    expect(getClientIp(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4')
  })
})

describe('forge model allowlist', () => {
  it('defaults to a small grok allowlist', () => {
    expect(getAllowedModels()).toEqual(['grok-4.5', 'grok-4', 'grok-3'])
  })

  it('honors FORGE_ALLOWED_MODELS override', () => {
    process.env.FORGE_ALLOWED_MODELS = 'grok-4.5, grok-code-fast-1'
    expect(getAllowedModels()).toEqual(['grok-4.5', 'grok-code-fast-1'])
  })

  it('falls back to the allowlist head for unknown models', () => {
    expect(resolveForgeModel('gpt-5-super-premium')).toBe('grok-4.5')
    expect(resolveForgeModel('grok-4')).toBe('grok-4')
    expect(resolveForgeModel('  GROK-4  ')).toBe('grok-4')
  })
})

describe('token and temperature caps', () => {
  it('caps max_tokens at FORGE_MAX_TOKENS', () => {
    process.env.FORGE_MAX_TOKENS = '400'
    expect(clampMaxTokens(100000)).toBe(400)
    expect(clampMaxTokens(100)).toBe(100)
    expect(clampMaxTokens(undefined)).toBe(400)
  })

  it('never exceeds the absolute ceiling', () => {
    process.env.FORGE_MAX_TOKENS = '999999'
    expect(clampMaxTokens(999999)).toBe(2000)
  })

  it('clamps temperature into range', () => {
    expect(clampTemperature(99)).toBe(1.5)
    expect(clampTemperature(-1)).toBe(0)
    expect(clampTemperature(undefined)).toBe(0.75)
  })
})

describe('validateMessages', () => {
  it('accepts a normal prompt', () => {
    expect(validateMessages([{ role: 'user', content: 'hello' }])).toBeNull()
  })

  it('rejects oversized payloads', () => {
    expect(validateMessages([])).toMatch(/1-20/)
    expect(validateMessages(new Array(21).fill({ role: 'user', content: 'x' }))).toMatch(/1-20/)
    expect(validateMessages([{ role: 'user', content: 'x'.repeat(12_001) }])).toMatch(/exceeds/)
  })
})

describe('checkRateLimit (memory fallback)', () => {
  it('blocks after the limit within a window', async () => {
    const ip = `test-${Date.now()}`
    const opts = { kv: null, prefix: 'test:rl', ip, limit: 2, windowSec: 60 }
    expect((await checkRateLimit(opts)).allowed).toBe(true)
    expect((await checkRateLimit(opts)).allowed).toBe(true)
    const third = await checkRateLimit(opts)
    expect(third.allowed).toBe(false)
    expect(third.remaining).toBe(0)
  })
})
