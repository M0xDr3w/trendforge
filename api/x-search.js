// Vercel serverless function to proxy X API calls securely
// Set X_BEARER_TOKEN in Vercel env vars.
// Enforces a monthly spend cap using Vercel KV when configured.

import { kv } from '@vercel/kv'
import {
  checkAppToken,
  checkRateLimit,
  getClientIp,
  isAllowedOrigin,
  rateLimitConfig,
} from './_lib/guard.js'
import { getSessionId, isKnownSession } from './_lib/session.js'
import { chargeSpend } from './_lib/spend.js'

function sendError(res, status, code, error, hint) {
  return res.status(status).json({ error, code, hint })
}

function parseUsdEnv(name, fallbackNumber) {
  const raw = process.env[name]
  if (!raw) return fallbackNumber
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : fallbackNumber
}

function parseXApiError(httpStatus, bodyText) {
  let payload = {}
  try {
    payload = JSON.parse(bodyText)
  } catch {
    payload = { detail: bodyText?.slice(0, 200) || 'Unknown X API error' }
  }

  const detail = String(payload.detail || payload.title || payload.error || '').toLowerCase()
  const apiStatus = payload.status || httpStatus

  if (detail.includes('credits depleted') || apiStatus === 402) {
    return {
      code: 'credits_depleted',
      error: 'X API credits depleted',
      hint: 'Restore credits or upgrade your X Developer plan at developer.x.com → Billing.',
    }
  }
  if (detail.includes('max_results') || (detail.includes('invalid') && detail.includes('parameter'))) {
    return {
      code: 'invalid_max_results',
      error: 'Invalid max_results parameter',
      hint: 'max_results must be between 1 and 100. Values below 10 fetch 10 from X and slice the response.',
    }
  }
  if (apiStatus === 429) {
    return {
      code: 'rate_limit',
      error: 'X API rate limit exceeded',
      hint: 'Wait before retrying. Reduce polling frequency if using LIVE REAL.',
    }
  }
  if (apiStatus === 401) {
    return {
      code: 'unauthorized',
      error: 'X API unauthorized',
      hint: 'Regenerate Bearer Token at developer.x.com and update X_BEARER_TOKEN in Vercel.',
    }
  }
  if (apiStatus === 403) {
    return {
      code: 'forbidden',
      error: 'X API access forbidden',
      hint: 'Your app may lack Recent Search access or required API tier.',
    }
  }
  if (apiStatus === 400) {
    return {
      code: 'invalid_request',
      error: payload.title || 'Invalid X API request',
      hint: payload.detail || 'Check query syntax and API parameters.',
    }
  }

  return {
    code: 'proxy_error',
    error: payload.title || 'X API error',
    hint: payload.detail || 'Check Vercel logs and X Developer portal status.',
  }
}

export default async function handler(req, res) {
  // Same-origin gate: the deployed app's browser fetch always carries a
  // matching Origin/Referer; bare curl and third-party sites do not.
  if (!isAllowedOrigin(req)) {
    return sendError(
      res,
      403,
      'origin_forbidden',
      'Cross-origin X search requests are blocked',
      'Call /api/x-search from the deployed app itself (same origin). Direct curl or third-party sites are rejected.',
    )
  }

  // Optional owner lockdown: enforced only when APP_ACCESS_TOKEN is set.
  if (!checkAppToken(req)) {
    return sendError(
      res,
      401,
      'app_unauthorized',
      'App access token required',
      'This deployment requires APP_ACCESS_TOKEN. Paste the matching token in the app session field.',
    )
  }

  const { query = 'AI', max_results = '20' } = req.query
  const parsed = parseInt(max_results, 10)
  const requested = Number.isFinite(parsed) ? parsed : 20

  if (Number.isFinite(parsed) && (parsed < 1 || parsed > 100)) {
    return sendError(
      res,
      400,
      'invalid_max_results',
      'Invalid max_results parameter',
      'max_results must be between 1 and 100. X API requires fetching at least 10; smaller values are sliced after fetch.',
    )
  }

  const mr = Math.min(100, Math.max(10, requested))

  const token = process.env.X_BEARER_TOKEN
  if (!token) {
    return sendError(
      res,
      500,
      'token_missing',
      'X bearer token not configured',
      'Set X_BEARER_TOKEN in Vercel env (Production + Preview), then redeploy.',
    )
  }

  // Hard monthly spend cap (default $20). Requires Vercel KV.
  const perPostUsd = parseUsdEnv('X_POST_COST_USD', 0.005) // ~ $0.005 per post read

  // KV is required to enforce the cap in production.
  const kvConfigured =
    !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN

  if (!kvConfigured) {
    return sendError(
      res,
      500,
      'spend_store_missing',
      'Monthly spend store not configured',
      'Set Vercel KV env (KV_REST_API_URL, KV_REST_API_TOKEN) to enforce X_SPEND_CAP_USD.',
    )
  }

  // Signed-in callers get their own generous session-scoped bucket instead
  // of skipping rate limiting; anonymous callers share the per-IP bucket.
  // Either way the shared monthly spend cap below still applies.
  const sid = getSessionId(req)
  const authed = await isKnownSession(kv, sid)
  const { limit: ipLimit, windowSec: ipWindow } = rateLimitConfig('X_SEARCH', 60, 3600)
  const { limit: sessLimit, windowSec: sessWindow } = rateLimitConfig('X_SEARCH_SESS', 300, 3600)
  const rate = await checkRateLimit({
    kv,
    prefix: authed ? 'xapi:ratelimit:sess' : 'xapi:ratelimit',
    ip: authed ? sid : getClientIp(req),
    limit: authed ? sessLimit : ipLimit,
    windowSec: authed ? sessWindow : ipWindow,
  })
  if (!rate.allowed) {
    return sendError(
      res,
      429,
      'proxy_rate_limit',
      'Too many X searches from your network',
      `Limit is ${authed ? sessLimit : ipLimit}/hour${authed ? ' per signed-in session' : ' per network'} — wait and retry. The shared monthly spend cap still applies.`,
    )
  }

  const preflight = await chargeSpend({ kv, reads: mr, costPerPostUsd: perPostUsd, dryRun: true })
  if (!preflight.ok) {
    if (preflight.code === 'spend_store_failed') {
      return sendError(
        res,
        500,
        'spend_store_missing',
        'Monthly spend store unreachable',
        'Vercel KV did not respond. Check KV env vars and retry.',
      )
    }
    return sendError(
      res,
      402,
      'spend_cap',
      'Monthly X budget cap reached',
      `Cap ${preflight.capUsd.toFixed(2)} USD reached for ${preflight.period}. Wait until next month or raise X_SPEND_CAP_USD.`,
    )
  }

  try {
    const url = `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=${mr}&tweet.fields=public_metrics,created_at,author_id,conversation_id&expansions=author_id&user.fields=username`

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      const errorText = await response.text()
      const parsedError = parseXApiError(response.status, errorText)
      return res.status(response.status >= 500 ? 502 : response.status).json(parsedError)
    }

    const data = await response.json()

    // Record actual posts returned. The X read already happened, so this
    // always increments (force) — a blown cap flags future calls, it never
    // drops data that was already paid for.
    const actualCount = Array.isArray(data?.data) ? data.data.length : 0
    await chargeSpend({ kv, reads: actualCount, costPerPostUsd: perPostUsd, force: true })

    const posts = (data.data || []).map((tweet, i) => {
      const user = (data.includes?.users || []).find(u => u.id === tweet.author_id) || {}
      const text = tweet.text || ''
      const likes = tweet.public_metrics?.like_count || 0
      const retweets = tweet.public_metrics?.retweet_count || 0

      const lower = text.toLowerCase()
      let sentiment = 0.15
      const pos = (lower.match(/(good|great|love|win|amazing|excited|🔥|based|ship|nice|solid|progress)/g) || []).length
      const neg = (lower.match(/(bad|fail|hate|crash|terrible|sad|😢|broken|issue|problem|down|layoff)/g) || []).length
      if (pos > neg) sentiment = Math.min(0.85, 0.3 + pos * 0.15)
      if (neg > pos) sentiment = Math.max(-0.7, -0.2 - neg * 0.12)
      if (pos > 0 && neg > 0) sentiment = (pos - neg) * 0.1

      return {
        id: Date.now() + i,
        text,
        username: user.username || 'xuser',
        timestamp: tweet.created_at || new Date().toISOString(),
        likes,
        retweets,
        sentiment: Number(sentiment.toFixed(2)),
      }
    })

    res.json(posts.slice(0, requested))
  } catch (err) {
    return sendError(
      res,
      500,
      'proxy_error',
      'Proxy error',
      err.message || 'Unexpected server error while contacting X API.',
    )
  }
}
