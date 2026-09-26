// Authenticated-session loader for Bookmark Forge data routes.
// Validates the httpOnly session cookie against KV and refreshes the X
// access token once (offline.access) when it is stale.

import { kv } from '@vercel/kv'
import {
  decryptTokens,
  encryptTokens,
  getSessionId,
  isUserAllowed,
  requireSessionSecret,
  sessionKey,
  SESSION_TTL_SEC,
} from './session.js'
import { fetchMe, refreshAccessToken } from './xapi.js'

const REFRESH_LOCK_SEC = 30

function refreshLockKey(sid) {
  return `tf:refresh-lock:${sid}`
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function destroySession(sid) {
  await kv.del(sessionKey(sid)).catch(() => {})
}

/**
 * Single refresh path for X tokens (used by the session loader AND the
 * weekly-digest cron). X rotates refresh tokens: two concurrent refreshes
 * would burn the rotated token and log the user out. A short KV lock
 * serializes refreshes per session; losers re-read the winner's result
 * instead of attempting their own refresh.
 *
 * Returns { bundle, refreshed } on success paths, or { ok: false, code }
 * only when X positively revoked access (HTTP 400).
 */
export async function refreshSessionTokens({ sid, secret, bundle }) {
  const lockKey = refreshLockKey(sid)
  let locked = false
  try {
    locked = (await kv.set(lockKey, String(Date.now()), { nx: true, ex: REFRESH_LOCK_SEC })) === 'OK'
  } catch {
    locked = false
  }

  if (!locked) {
    // Someone else is refreshing: wait for their result, then use it.
    for (let i = 0; i < 5; i++) {
      await sleep(500)
      try {
        const sealed = await kv.get(sessionKey(sid))
        if (sealed) {
          const fresh = decryptTokens(secret, sealed)
          if ((fresh.gen || 0) > (bundle.gen || 0)) {
            return { bundle: fresh, refreshed: true }
          }
        }
      } catch {
        // Keep polling; fall through to the stale bundle below.
      }
    }
    // Lock holder died or is slow: proceed with the stale token once.
    // The downstream X call surfaces a natural 401 — never destroy here.
    return { bundle, refreshed: false }
  }

  try {
    const tokens = await refreshAccessToken({
      clientId: String(process.env.X_CLIENT_ID || '').trim(),
      clientSecret: String(process.env.X_CLIENT_SECRET || '').trim(),
      refreshToken: bundle.refreshToken,
    })
    const next = {
      ...bundle,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || bundle.refreshToken,
      expiresAt: Date.now() + Number(tokens.expires_in || 7200) * 1000,
      gen: (bundle.gen || 0) + 1,
    }
    await kv.set(sessionKey(sid), encryptTokens(secret, next), { ex: SESSION_TTL_SEC })
    return { bundle: next, refreshed: true }
  } catch (err) {
    if (err?.status === 400) {
      await destroySession(sid)
      return { ok: false, code: 'session_expired', status: 401, error: 'X revoked access — sign in again' }
    }
    // Transient refresh failure: proceed with the stale token once.
    return { bundle, refreshed: false }
  } finally {
    await kv.del(lockKey).catch(() => {})
  }
}

export async function loadSession(req) {
  const sid = getSessionId(req)
  if (!sid) {
    return { ok: false, code: 'not_signed_in', status: 401, error: 'Not signed in with X' }
  }
  const secret = requireSessionSecret()
  if (!secret) {
    return { ok: false, code: 'oauth_not_configured', status: 500, error: 'SESSION_SECRET not configured' }
  }
  let sealed
  try {
    sealed = await kv.get(sessionKey(sid))
  } catch {
    return { ok: false, code: 'session_store_failed', status: 500, error: 'Session store unreachable' }
  }
  if (!sealed) {
    return { ok: false, code: 'not_signed_in', status: 401, error: 'Session expired — sign in again' }
  }
  let bundle
  try {
    bundle = decryptTokens(secret, sealed)
  } catch {
    await destroySession(sid)
    return { ok: false, code: 'not_signed_in', status: 401, error: 'Session invalid — sign in again' }
  }

  // Refresh once when stale (60s skew). Missing refresh token => keep going;
  // the downstream X call will surface 401 and the UI prompts re-login.
  if (bundle.refreshToken && Date.now() > (bundle.expiresAt || 0) - 60_000) {
    const result = await refreshSessionTokens({ sid, secret, bundle })
    if (result.ok === false) return result
    bundle = result.bundle
  }

  // Backfill the X user id on old sessions.
  if (!bundle.xUserId) {
    try {
      const me = await fetchMe(bundle.accessToken)
      if (me?.id) {
        bundle = { ...bundle, xUserId: me.id, username: me.username || bundle.username }
        await kv.set(sessionKey(sid), encryptTokens(secret, bundle), { ex: SESSION_TTL_SEC })
      }
    } catch {
      // Non-fatal: routes without a user id return a clear error.
    }
  }

  // Owner-only lock: sessions minted before the lock (or with an unknown
  // id) stop working on paid routes the moment the allowlist excludes them.
  if (!isUserAllowed(bundle.xUserId)) {
    return {
      ok: false,
      code: 'user_not_allowed',
      status: 403,
      error: 'This TrendForge instance is private to its owner',
    }
  }

  return { ok: true, sid, bundle }
}

export function sessionHint(code) {
  if (code === 'not_signed_in' || code === 'session_expired') {
    return 'Sign in with X in the Bookmark Forge panel, then retry.'
  }
  if (code === 'user_not_allowed') {
    return 'The owner limits this instance to approved X accounts (X_ALLOWED_USER_IDS).'
  }
  if (code === 'oauth_not_configured') {
    return 'Set X_CLIENT_ID, X_CLIENT_SECRET, SESSION_SECRET, and KV vars in Vercel env. See SETUP.md.'
  }
  return 'Check Vercel function logs and KV env vars.'
}
