// Server-side OpenAI-compatible proxy for xAI Grok.
// Keeps XAI_API_KEY off the client. Set XAI_API_KEY in Vercel / local env.
//
// POST /api/forge-chat
// Body: OpenAI chat completions JSON ({ model, messages, stream, temperature, max_tokens })
// Optional: Authorization: Bearer <user key> overrides env for power users (session-only in UI).
//
// Abuse gates (no login on this app, so defense in depth):
// - Same-origin check (Origin/Referer must match the request host, or APP_ORIGIN).
// - Optional APP_ACCESS_TOKEN lockdown (x-app-token header / app_token query).
// - KV-backed per-IP rate limiting (FORGE_CHAT_PER_HOUR, default 30/hr).
// - Server-side model allowlist (FORGE_ALLOWED_MODELS) + max_tokens cap
//   (FORGE_MAX_TOKENS) so callers can't pick premium models or giant
//   completions on the owner's xAI credit.

import { kv } from '@vercel/kv'
import {
  checkAppToken,
  checkRateLimit,
  clampMaxTokens,
  clampTemperature,
  getAllowedModels,
  getClientIp,
  isAllowedOrigin,
  rateLimitConfig,
  resolveForgeModel,
  validateMessages,
} from './_lib/guard.js'
import { getSessionId, sessionKey } from './_lib/session.js'

const XAI_CHAT_URL = 'https://api.x.ai/v1/chat/completions'
const UPSTREAM_TIMEOUT_MS = 55_000

function sendJson(res, status, body) {
  res.status(status).json(body)
}

function extractBearer(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || ''
  const m = String(h).match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : ''
}

function kvConfigured() {
  return !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-app-token')
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, {
      error: 'Method not allowed',
      code: 'method_not_allowed',
      hint: 'POST OpenAI-compatible chat completions body to /api/forge-chat.',
    })
  }

  if (!isAllowedOrigin(req)) {
    return sendJson(res, 403, {
      error: 'Cross-origin forge requests are blocked',
      code: 'origin_forbidden',
      hint: 'Call /api/forge-chat from the deployed app itself (same origin). Direct curl or third-party sites are rejected.',
    })
  }

  if (!checkAppToken(req)) {
    return sendJson(res, 401, {
      error: 'App access token required',
      code: 'app_unauthorized',
      hint: 'This deployment requires APP_ACCESS_TOKEN. Paste the matching token in the app session field.',
    })
  }

  const { limit, windowSec } = rateLimitConfig('FORGE_CHAT', 30, 3600)
  // Signed-in X sessions carry their own trust: skip the per-IP bucket.
  let forgeAuthed = false
  const forgeSid = getSessionId(req)
  if (forgeSid && kvConfigured()) {
    try {
      forgeAuthed = !!(await kv.get(sessionKey(forgeSid)))
    } catch {
      forgeAuthed = false
    }
  }
  const rate = forgeAuthed
    ? { allowed: true, remaining: limit }
    : await checkRateLimit({
        kv: kvConfigured() ? kv : null,
        prefix: 'forge:ratelimit',
        ip: getClientIp(req),
        limit,
        windowSec,
      })
  if (!rate.allowed) {
    return sendJson(res, 429, {
      error: 'Forge rate limit exceeded',
      code: 'forge_rate_limit',
      hint: `Too many forge requests from your network. Limit is ${limit}/hour — wait and retry.`,
    })
  }

  // Review decision (kept deliberately): a caller-supplied Bearer key is still
  // honored. It spends the *caller's* xAI quota, not the owner's, and exists
  // so the app works on deployments without XAI_API_KEY (session key in the
  // forge panel, sessionStorage only) and so operators can isolate personal
  // quota. Proxy-hop abuse is bounded by the same-origin gate + per-IP rate
  // limit above; cross-site browser abuse is impossible without the origin.
  const envKey = (process.env.XAI_API_KEY || '').trim()
  const headerKey = extractBearer(req)
  const apiKey = headerKey || envKey

  if (!apiKey) {
    return sendJson(res, 503, {
      error: 'XAI_API_KEY not configured',
      code: 'missing_xai_key',
      hint: 'Set XAI_API_KEY in Vercel env (or local vercel dev). Optional: paste a session API key in the forge panel.',
    })
  }

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      return sendJson(res, 400, {
        error: 'Invalid JSON body',
        code: 'invalid_json',
        hint: 'Send a chat completions JSON object.',
      })
    }
  }

  if (!body || typeof body !== 'object' || !Array.isArray(body.messages)) {
    return sendJson(res, 400, {
      error: 'Invalid chat body',
      code: 'invalid_body',
      hint: 'Body must include messages: [{ role, content }, ...].',
    })
  }

  const messagesError = validateMessages(body.messages)
  if (messagesError) {
    return sendJson(res, 400, {
      error: 'Invalid chat body',
      code: 'invalid_body',
      hint: messagesError,
    })
  }

  const stream = Boolean(body.stream)
  // Server decides the model and token budget: caller preference is honored
  // only inside the allowlist / cap. An explicitly disallowed model is a
  // loud 400 (not a silent swap) so probing and typos stay visible.
  const { model: resolvedModel, allowed: modelAllowed } = resolveForgeModel(body.model)
  if (!modelAllowed) {
    return sendJson(res, 400, {
      error: `Model not allowed: ${String(body.model).slice(0, 80)}`,
      code: 'invalid_model',
      hint: `Allowed models: ${getAllowedModels().join(', ')} (FORGE_ALLOWED_MODELS). Omit model for the server default.`,
    })
  }
  const payload = {
    model: resolvedModel,
    messages: body.messages,
    temperature: clampTemperature(body.temperature),
    max_tokens: clampMaxTokens(body.max_tokens),
    stream,
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

  try {
    const upstream = await fetch(XAI_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(stream ? { Accept: 'text/event-stream' } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '')
      const snippet = errText.replace(/\s+/g, ' ').trim().slice(0, 240)
      let code = 'xai_error'
      let hint = snippet || 'Check XAI_API_KEY and model id in console.x.ai.'
      if (upstream.status === 401 || upstream.status === 403) {
        code = 'xai_unauthorized'
        hint = 'Invalid XAI_API_KEY. Create/rotate a key at console.x.ai.'
      } else if (upstream.status === 429) {
        code = 'xai_rate_limit'
        hint = 'xAI rate limited. Wait and retry.'
      } else if (upstream.status === 404) {
        code = 'xai_model_not_found'
        hint = 'Model not found. Check FORGE_ALLOWED_MODELS and docs.x.ai/developers/models.'
      }
      return sendJson(res, upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502, {
        error: `xAI returned ${upstream.status}`,
        code,
        hint,
      })
    }

    if (stream && upstream.body) {
      res.status(200)
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.setHeader('Connection', 'keep-alive')

      const reader = upstream.body.getReader()
      const decoder = new TextDecoder()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(decoder.decode(value, { stream: true }))
        }
      } finally {
        res.end()
      }
      return
    }

    const data = await upstream.json()
    return sendJson(res, 200, data)
  } catch (err) {
    if (err?.name === 'AbortError') {
      return sendJson(res, 504, {
        error: 'xAI request timed out',
        code: 'xai_timeout',
        hint: 'Upstream took too long. Retry or reduce max_tokens.',
      })
    }
    return sendJson(res, 502, {
      error: 'Failed to reach xAI',
      code: 'xai_network',
      hint: err?.message || 'Network error calling api.x.ai.',
    })
  } finally {
    clearTimeout(timeoutId)
  }
}
