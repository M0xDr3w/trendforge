// Shared server-side guards for TrendForge Vercel proxies.
//
// Design (no-login personal app):
// - Same-origin check is the primary gate: the browser always sends
//   Origin/Referer for same-origin fetch, while a stranger's site or a bare
//   curl does not match the request host. Rejected with `origin_forbidden`.
// - Optional APP_ACCESS_TOKEN lockdown: when the owner sets it in Vercel env,
//   every call must also present the same value via the `x-app-token` header
//   (or `app_token` query param). Rejected with `app_unauthorized`.
// - KV-backed per-IP rate limiting caps abuse even when the origin is
//   spoofed. Falls back to a best-effort in-memory bucket when KV is absent
//   (serverless instances don't share memory, so KV is the real enforcement).
// - forge-chat additionally enforces a server-side model allowlist and caps
//   max_tokens / temperature / payload size so callers can't pick premium
//   models or giant completions on the owner's xAI credit.

const memoryBuckets = new Map()

function getHeader(req, name) {
  const headers = req?.headers || {}
  const lower = name.toLowerCase()
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      const value = headers[key]
      return Array.isArray(value) ? value[0] : value
    }
  }
  return ''
}

export function getClientIp(req) {
  const forwarded = String(getHeader(req, 'x-forwarded-for') || '').split(',')[0].trim()
  if (forwarded) return forwarded
  const realIp = String(getHeader(req, 'x-real-ip') || '').trim()
  if (realIp) return realIp
  return 'unknown'
}

function hostWithoutPort(host) {
  return String(host || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
}

function candidateHosts(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    return hostWithoutPort(new URL(raw).host)
  } catch {
    return ''
  }
}

/**
 * Same-origin check. Derives the expected host from the request itself
 * (x-forwarded-host / host, which Vercel sets per deployment, so preview
 * URLs work without extra config). APP_ORIGIN (comma-separated hosts or
 * URLs) overrides the derivation when set.
 */
export function isAllowedOrigin(req) {
  const originHost = candidateHosts(getHeader(req, 'origin'))
  const refererHost = candidateHosts(getHeader(req, 'referer'))
  const candidate = originHost || refererHost
  if (!candidate) return false

  const override = String(process.env.APP_ORIGIN || '')
    .split(',')
    .map(s => candidateHosts(s) || hostWithoutPort(s))
    .filter(Boolean)
  if (override.length > 0) return override.includes(candidate)

  const expected = hostWithoutPort(
    getHeader(req, 'x-forwarded-host') || getHeader(req, 'host'),
  )
  if (!expected) return false
  return candidate === expected
}

/**
 * Optional shared-secret gate. Passes open when APP_ACCESS_TOKEN is unset
 * (dev / default), enforced when set (owner lockdown).
 */
export function checkAppToken(req) {
  const expected = String(process.env.APP_ACCESS_TOKEN || '').trim()
  if (!expected) return true
  const headerToken = String(getHeader(req, 'x-app-token') || '').trim()
  const queryToken = String(req?.query?.app_token || '').trim()
  return headerToken === expected || queryToken === expected
}

function parsePositiveInt(raw, fallback) {
  const n = Number.parseInt(String(raw ?? ''), 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function memoryCheck(key, limit, windowSec) {
  const now = Date.now()
  const entry = memoryBuckets.get(key)
  if (!entry || entry.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowSec * 1000 })
    return { allowed: true, remaining: limit - 1 }
  }
  entry.count += 1
  return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count) }
}

/**
 * Per-IP rate limit. Uses Vercel KV when configured, otherwise a
 * best-effort in-memory bucket (not shared across serverless instances).
 */
export async function checkRateLimit({ kv, prefix, ip, limit, windowSec }) {
  const windowKey = Math.floor(Date.now() / (windowSec * 1000))
  const key = `${prefix}:${ip}:${windowKey}`
  if (kv) {
    try {
      const count = await kv.incr(key)
      if (count === 1) {
        try {
          await kv.expire(key, windowSec)
        } catch {
          // Non-fatal: the key still rolls over on the next window.
        }
      }
      return { allowed: count <= limit, remaining: Math.max(0, limit - count) }
    } catch {
      // KV hiccup: fall through to memory rather than failing closed here.
    }
  }
  return memoryCheck(key, limit, windowSec)
}

// --- forge-chat model / token caps --------------------------------------

export const FORGE_DEFAULT_MODEL = 'grok-4.5'
const FALLBACK_ALLOWED_MODELS = ['grok-4.5', 'grok-4', 'grok-3']
const FORGE_ABSOLUTE_MAX_TOKENS = 2000
const FORGE_MAX_MESSAGES = 20
const FORGE_MAX_MESSAGE_CHARS = 12_000

export function getAllowedModels() {
  const raw = String(process.env.FORGE_ALLOWED_MODELS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  const list = raw.length > 0 ? raw : FALLBACK_ALLOWED_MODELS
  return [...new Set(list.map(m => m.toLowerCase()))]
}

export function resolveForgeModel(requested) {
  const allowed = getAllowedModels()
  const raw = String(requested || '').trim().toLowerCase()
  // Unspecified: server default. Explicit but outside the allowlist: reject
  // loudly (400 at the route) instead of silently substituting, so probing
  // and typos are visible instead of masked.
  if (!raw) return { model: FORGE_DEFAULT_MODEL, allowed: true }
  if (allowed.includes(raw)) return { model: raw, allowed: true }
  return { model: allowed[0] || FORGE_DEFAULT_MODEL, allowed: false, requested: raw }
}

export function clampMaxTokens(requested) {
  const cap = Math.min(
    parsePositiveInt(process.env.FORGE_MAX_TOKENS, 1000),
    FORGE_ABSOLUTE_MAX_TOKENS,
  )
  const n = Number(requested)
  if (!Number.isFinite(n) || n <= 0) return Math.min(900, cap)
  return Math.min(Math.floor(n), cap)
}

export function clampTemperature(requested) {
  const n = Number(requested)
  if (!Number.isFinite(n)) return 0.75
  return Math.min(1.5, Math.max(0, n))
}

/** Rejects oversized chat payloads before they reach xAI. Returns an error string or null. */
export function validateMessages(messages) {
  if (!Array.isArray(messages)) return 'Body must include messages: [{ role, content }, ...].'
  if (messages.length === 0 || messages.length > FORGE_MAX_MESSAGES) {
    return `messages must contain 1-${FORGE_MAX_MESSAGES} entries.`
  }
  let total = 0
  for (const m of messages) {
    const content = typeof m?.content === 'string' ? m.content : ''
    total += content.length
    if (content.length > FORGE_MAX_MESSAGE_CHARS) {
      return `A single message exceeds ${FORGE_MAX_MESSAGE_CHARS} characters.`
    }
  }
  if (total > FORGE_MAX_MESSAGE_CHARS * 2) {
    return 'Total message content is too large for a single forge request.'
  }
  return null
}

export function rateLimitConfig(name, defaultLimit, defaultWindowSec) {
  return {
    limit: parsePositiveInt(process.env[`${name}_PER_HOUR`], defaultLimit),
    windowSec: parsePositiveInt(process.env[`${name}_WINDOW_SEC`], defaultWindowSec),
  }
}
