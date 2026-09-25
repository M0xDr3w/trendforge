import { describe, expect, it } from 'vitest'
import {
  codeChallenge,
  decryptTokens,
  encryptTokens,
  getSessionId,
  parseCookies,
  pkceKey,
  sessionKey,
} from './session.js'

describe('parseCookies / getSessionId', () => {
  it('extracts the session cookie', () => {
    const req = { headers: { cookie: 'a=1; tf_session=abc123; b=2' } }
    expect(parseCookies(req).tf_session).toBe('abc123')
    expect(getSessionId(req)).toBe('abc123')
  })
  it('returns empty when absent', () => {
    expect(getSessionId({ headers: {} })).toBe('')
  })
})

describe('codeChallenge', () => {
  it('matches the RFC 7636 S256 vector', () => {
    // SHA-256 digests are 32 bytes -> always 43 base64url chars.
    expect(codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    )
  })
})

describe('encryptTokens / decryptTokens', () => {
  it('round-trips a token bundle', () => {
    const secret = 'test-session-secret-12345'
    const bundle = { accessToken: 'at', refreshToken: 'rt', expiresAt: 123, xUserId: '42' }
    const sealed = encryptTokens(secret, bundle)
    expect(sealed.iv).toBeTruthy()
    expect(sealed.tag).toBeTruthy()
    expect(sealed.data).toBeTruthy()
    expect(decryptTokens(secret, sealed)).toEqual(bundle)
  })
  it('fails with the wrong secret', () => {
    const sealed = encryptTokens('correct-secret-12345', { a: 1 })
    expect(() => decryptTokens('wrong-secret-123456', sealed)).toThrow()
  })
})

describe('key helpers', () => {
  it('namespaces pkce and session keys', () => {
    expect(pkceKey('s')).toBe('tf:pkce:s')
    expect(sessionKey('s')).toBe('tf:sess:s')
  })
})
