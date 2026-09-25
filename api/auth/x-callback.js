// GET /api/auth/x-callback — X OAuth redirect target.
// Validates PKCE state, exchanges the code, encrypts tokens into KV,
// and sets the httpOnly session cookie. Tokens never touch the browser.

import { kv } from '@vercel/kv'
import {
  clearSessionCookie,
  decryptTokens,
  encryptTokens,
  getSessionId,
  newSessionId,
  pkceKey,
  publicBaseUrl,
  requireSessionSecret,
  sessionKey,
  setSessionCookie,
} from '../_lib/session.js'
import { exchangeCode, fetchMe } from '../_lib/xapi.js'

export default async function handler(req, res) {
  const { code, state, error } = req.query || {}
  const home = `${publicBaseUrl(req)}/`

  if (error) {
    return res.redirect(302, `${home}?auth=denied`)
  }
  if (!code || !state) {
    return res.status(400).json({
      error: 'Missing code or state',
      code: 'oauth_invalid_callback',
      hint: 'Start again from Sign in with X.',
    })
  }

  const secret = requireSessionSecret()
  const clientId = String(process.env.X_CLIENT_ID || '').trim()
  const clientSecret = String(process.env.X_CLIENT_SECRET || '').trim()
  if (!secret || !clientId || !clientSecret) {
    return res.status(500).json({
      error: 'X OAuth not configured',
      code: 'oauth_not_configured',
      hint: 'Set X_CLIENT_ID, X_CLIENT_SECRET, and SESSION_SECRET (min 16 chars) in Vercel env.',
    })
  }

  const pkce = await kv.get(pkceKey(String(state))).catch(() => null)
  if (!pkce?.verifier) {
    return res.status(400).json({
      error: 'Login session expired',
      code: 'oauth_state_expired',
      hint: 'PKCE state is single-use and expires in 10 minutes. Start again from Sign in with X.',
    })
  }
  await kv.del(pkceKey(String(state))).catch(() => {})

  let tokens
  try {
    tokens = await exchangeCode({
      clientId,
      clientSecret,
      code: String(code),
      verifier: pkce.verifier,
      redirectUri: pkce.redirectUri,
    })
  } catch (err) {
    const status = err?.status || 502
    return res.status(status >= 400 && status < 600 ? status : 502).json({
      error: 'X token exchange failed',
      code: 'oauth_exchange_failed',
      hint: 'Check the OAuth callback URL in console.x.com matches this deployment, then retry.',
    })
  }

  const expiresAt = Date.now() + Number(tokens.expires_in || 7200) * 1000
  let me = null
  try {
    me = await fetchMe(tokens.access_token)
  } catch {
    me = null
  }

  // Reuse an existing session id when the browser already has one.
  let sid = getSessionId(req)
  if (!sid) sid = newSessionId()
  // Avoid sealing a crash blob: validate the round-trip in memory first.
  const bundle = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || null,
    expiresAt,
    xUserId: me?.id || null,
    username: me?.username || null,
  }
  let sealed
  try {
    sealed = encryptTokens(secret, bundle)
    decryptTokens(secret, sealed)
  } catch {
    clearSessionCookie(req, res)
    return res.status(500).json({
      error: 'Could not seal session',
      code: 'session_seal_failed',
      hint: 'SESSION_SECRET is misconfigured. Check Vercel env and retry.',
    })
  }
  try {
    await kv.set(sessionKey(sid), sealed, { ex: 30 * 24 * 3600 })
  } catch {
    return res.status(500).json({
      error: 'Could not store session',
      code: 'session_store_failed',
      hint: 'Vercel KV is unreachable. Check KV env vars and retry.',
    })
  }
  setSessionCookie(req, res, sid)
  return res.redirect(302, `${home}?auth=ok`)
}
