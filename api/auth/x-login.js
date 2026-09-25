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
import { isAllowedOrigin } from '../_lib/guard.js'

const SCOPES = 'bookmark.read tweet.read users.read offline.access'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' })
  }

  // Same-origin start keeps third-party sites from kicking off logins.
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({
      error: 'Cross-origin login blocked',
      code: 'origin_forbidden',
      hint: 'Start sign-in from the deployed app itself.',
    })
  }

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
