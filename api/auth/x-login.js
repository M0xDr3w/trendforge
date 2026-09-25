// GET /api/auth/x-login — start X OAuth 2.0 Authorization Code + PKCE.
// Redirects the browser to X; never exposes secrets to the client.

import { kv } from '@vercel/kv'
import {
  codeChallenge,
  newCodeVerifier,
  newState,
  pkceKey,
  PKCE_TTL_SEC,
  publicBaseUrl,
} from '../_lib/session.js'

const SCOPES = 'bookmark.read tweet.read users.read offline.access'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' })
  }

  // Deliberately NO same-origin gate here: this is a top-level browser
  // navigation to X (link click / typed URL), which carries no Origin header
  // and only sometimes a Referer — gating on it 403s legitimate sign-ins.
  // CSRF protection comes from OAuth itself: single-use random `state`
  // bound to a 10-minute server-side PKCE record. An attacker who tricks a
  // victim into starting a login gains nothing: the code is exchanged
  // server-side and the session is sealed to whoever completes the flow.

  const clientId = String(process.env.X_CLIENT_ID || '').trim()
  if (!clientId) {
    return res.status(500).json({
      error: 'X OAuth not configured',
      code: 'oauth_not_configured',
      hint: 'Set X_CLIENT_ID (+ X_CLIENT_SECRET, SESSION_SECRET, KV vars) in Vercel env. See SETUP.md.',
    })
  }
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({
      error: 'Session store not configured',
      code: 'session_store_missing',
      hint: 'Bind Vercel KV (KV_REST_API_URL, KV_REST_API_TOKEN) so PKCE state and sessions persist.',
    })
  }

  const redirectUri = `${publicBaseUrl(req)}/api/auth/x-callback`
  const state = newState()
  const verifier = newCodeVerifier()
  await kv.set(pkceKey(state), { verifier, redirectUri }, { ex: PKCE_TTL_SEC })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
    code_challenge: codeChallenge(verifier),
    code_challenge_method: 'S256',
  })
  res.redirect(302, `https://x.com/i/oauth2/authorize?${params}`)
}
