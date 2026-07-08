// Vercel serverless function to proxy X API calls securely
// Set X_BEARER_TOKEN in Vercel env vars.

function sendError(res, status, code, error, hint) {
  return res.status(status).json({ error, code, hint })
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
      hint: 'max_results must be between 10 and 100.',
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
  const { query = 'AI', max_results = '20' } = req.query
  const parsed = parseInt(max_results, 10)

  if (Number.isFinite(parsed) && (parsed < 10 || parsed > 100)) {
    return sendError(
      res,
      400,
      'invalid_max_results',
      'Invalid max_results parameter',
      'max_results must be between 10 and 100.',
    )
  }

  const mr = Math.min(100, Math.max(10, Number.isFinite(parsed) ? parsed : 20))

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

    res.json(posts)
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
