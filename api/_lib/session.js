// Server-side X OAuth session helpers (Bookmark Forge).
//
// Tokens stay server-side: the access/refresh pair is AES-256-GCM encrypted
// with SESSION_SECRET and stored in Vercel KV under `tf:sess:<id>`. The
// browser only ever sees the opaque `tf_session` httpOnly cookie — tokens
// never enter the client bundle, git, or logs.

import crypto from 'node:crypto'

export const SESSION_COOKIE = 'tf_session'
export const SESSION_TTL_SEC = 30 * 24 * 3600
const PKCE_TTL_SEC = 600

export function pkceKey(state) {
  return `tf:pkce:${state}`
}

export function sessionKey(sid) {
  return `tf:sess:${sid}`
}

export function parseCookies(req) {
  const raw = req?.headers?.cookie || req?.headers?.Cookie || ''
  const out = {}
  for (const part of String(raw).split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const name = part.slice(0, idx).trim()
    const value = decodeURIComponent(part.slice(idx + 1).trim())
    if (name) out[name] = value
  }
  return out
}

export function getSessionId(req) {
  return parseCookies(req)[SESSION_COOKIE] || ''
}

/** True when the session id names a live KV record (never throws). */
export async function isKnownSession(kv, sid) {
  if (!sid || !kv) return false
  try {
    return !!(await kv.get(sessionKey(sid)))
  } catch {
    return false
  }
}

export function newSessionId() {
  return crypto.randomBytes(24).toString('base64url')
}

export function newState() {
  return crypto.randomBytes(16).toString('base64url')
}

export function newCodeVerifier() {
  return crypto.randomBytes(48).toString('base64url')
}

export function codeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

function cookieFlags(req) {
  const proto = String(
    req?.headers?.['x-forwarded-proto'] || (req?.socket?.encrypted ? 'https' : 'http'),
  )
    .split(',')[0]
    .trim()
  const secure = proto === 'https' ? '; Secure' : ''
  return secure
}

export function setSessionCookie(req, res, sid) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SEC}${cookieFlags(req)}`,
  )
}

export function clearSessionCookie(req, res) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${cookieFlags(req)}`,
  )
}

function keyFromSecret(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest()
}

export function requireSessionSecret() {
  const secret = String(process.env.SESSION_SECRET || '')
  if (secret.length < 16) return null
  return secret
}

export function encryptTokens(secret, obj) {
  const key = keyFromSecret(secret)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([
    cipher.update(JSON.stringify(obj), 'utf8'),
    cipher.final(),
  ]).toString('base64')
  return {
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data,
  }
}

export function decryptTokens(secret, payload) {
  const key = keyFromSecret(secret)
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(payload.iv, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
  const text = Buffer.concat([
    decipher.update(Buffer.from(payload.data, 'base64')),
    decipher.final(),
  ]).toString('utf8')
  return JSON.parse(text)
}

/** Public request host for building the OAuth callback URL (works on preview + prod). */
export function publicBaseUrl(req) {
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim()
  const proto = String(req?.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim()
  return `${proto}://${host}`
}

export { PKCE_TTL_SEC }
