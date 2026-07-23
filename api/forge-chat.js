// Server-side OpenAI-compatible proxy for xAI Grok.
// Keeps XAI_API_KEY off the client. Set XAI_API_KEY in Vercel / local env.
//
// POST /api/forge-chat
// Body: OpenAI chat completions JSON ({ model, messages, stream, temperature, max_tokens })
// Optional: Authorization: Bearer <user key> overrides env for power users (session-only in UI).

const XAI_CHAT_URL = 'https://api.x.ai/v1/chat/completions'
const DEFAULT_MODEL = 'grok-4.5'
const UPSTREAM_TIMEOUT_MS = 55_000

function sendJson(res, status, body) {
  res.status(status).json(body)
}

function extractBearer(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || ''
  const m = String(h).match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : ''
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, {
      error: 'Method not allowed',
      code: 'method_not_allowed',
      hint: 'POST OpenAI-compatible chat completions body to /api/forge-chat.',
    })
  }

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

  const stream = Boolean(body.stream)
  const payload = {
    model: (body.model && String(body.model).trim()) || DEFAULT_MODEL,
    messages: body.messages,
    temperature: typeof body.temperature === 'number' ? body.temperature : 0.75,
    max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : 900,
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
        hint = `Model not found. Try "${DEFAULT_MODEL}" or check docs.x.ai/developers/models.`
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
