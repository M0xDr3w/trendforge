// Authenticated-session loader for Bookmark Forge data routes.
// Validates the httpOnly session cookie against KV and refreshes the X
// access token once (offline.access) when it is stale.

import { kv } from '@vercel/kv'
import {
  decryptTokens,
  encryptTokens,
  getSessionId,
  requireSessionSecret,
  sessionKey,
  SESSION_TTL_SEC,
} from './session.js'
import { fetchMe, refreshAccessToken } from './xapi.js'

async function destroySession(sid) {
  await kv.del(sessionKey(sid)).catch(() => {})
}

export async function loadSession(req) {
  const sid = getSessionId(req)
  if (!sid) {
    return { ok: false, code: 'not_signed_in', error: 'Not signed in with X' }
  }
  const secret = requireSessionSecret()
  if (!secret) {
    return { ok: false, code: 'oauth_not_configured', error: 'SESSION_SECRET not configured' }
  }
  let sealed
  try {
    sealed = await kv.get(sessionKey(sid))
  } catch {
    return { ok: false, code: 'session_store_failed', error: 'Session store unreachable' }
  }
  if (!sealed) {
    return { ok: false, code: 'not_signed_in', error: 'Session expired — sign in again' }
  }
  let bundle
  try {
    bundle = decryptTokens(secret, sealed)
  } catch {
    await destroySession(sid)
    return { ok: false, code: 'not_signed_in', error: 'Session invalid — sign in again' }
  }

  // Refresh once when stale (60s skew). Missing refresh token => keep going;
  // the downstream X call will surface 401 and the UI prompts re-login.
  if (bundle.refreshToken && Date.now() > (bundle.expiresAt || 0) - 60_000) {
    try {
      const tokens = await refreshAccessToken({
        clientId: String(process.env.X_CLIENT_ID || '').trim(),
        clientSecret: String(process.env.X_CLIENT_SECRET || '').trim(),
        refreshToken: bundle.refreshToken,
      })
      bundle = {
        ...bundle,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || bundle.refreshToken,
        expiresAt: Date.now() + Number(tokens.expires_in || 7200) * 1000,
      }
      await kv.set(sessionKey(sid), encryptTokens(secret, bundle), { ex: SESSION_TTL_SEC })
    } catch (err) {
      if (err?.status === 400) {
        await destroySession(sid)
        return { ok: false, code: 'session_expired', error: 'X revoked access — sign in again' }
      }
      // Transient refresh failure: proceed with the stale token once.
    }
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

  return { ok: true, sid, bundle }
}

export function sessionHint(code) {
  if (code === 'not_signed_in' || code === 'session_expired') {
    return 'Sign in with X in the Bookmark Forge panel, then retry.'
  }
  if (code === 'oauth_not_configured') {
    return 'Set X_CLIENT_ID, X_CLIENT_SECRET, SESSION_SECRET, and KV vars in Vercel env. See SETUP.md.'
  }
  return 'Check Vercel function logs and KV env vars.'
}
