// Shared spend-cap + digest helpers for Bookmark Forge routes.
// Spend accounting reuses the same monthly KV key as /api/x-search so
// bookmark reads and recent search draw from one owner budget.

export function monthKey(base = 'xapi:spend_cents') {
  const d = new Date()
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${base}:${yyyy}-${mm}`
}

export function spendCapCents() {
  const raw = process.env.X_SPEND_CAP_USD
  const n = raw ? Number(raw) : 20
  const usd = Number.isFinite(n) && n >= 0 ? n : 20
  return Math.round(usd * 100)
}

export function kvConfigured() {
  return !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN
}

/**
 * Preflight + charge for N reads at costPerPostUsd. Returns
 * { ok: true } or { ok: false, capUsd, period } when the cap blocks.
 * With dryRun, checks without incrementing (preflight before an X call).
 */
export async function chargeSpend({ kv, reads, costPerPostUsd, dryRun = false }) {
  const key = monthKey()
  const capCents = spendCapCents()
  const planned = Math.ceil(reads * costPerPostUsd * 100)
  const current = Number((await kv.get(key)) || 0) || 0
  if (current + planned > capCents) {
    return { ok: false, capUsd: capCents / 100, period: key.split(':')[1] }
  }
  if (planned > 0 && !dryRun) {
    try {
      await kv.incrby(key, planned)
    } catch {
      // Non-fatal: the preflight above already gated this request.
    }
  }
  return { ok: true }
}

export function bookmarksKey(uid) {
  return `tf:bm:${uid}`
}

export function foldersKey(uid) {
  return `tf:bm:${uid}:folders`
}

export function metaKey(uid) {
  return `tf:bm:${uid}:meta`
}

export function digestKey(uid) {
  return `tf:digest:${uid}:latest`
}

export function buildDigestPrompt(posts) {
  const lines = posts
    .slice(0, 40)
    .map(p => `- [${p.id}] @${p.username}: ${p.text}`)
    .join('\n')
  return `Write a weekly brief over these ${posts.length} saved X posts.

Saved posts:
${lines}

Format (strict):
## This week in your saves
<3-5 sentence overview>

## Themes
1. <theme> — saves [id], [id]
2. <theme> — saves [id]

## Worth forging
- <one-line thread/post idea citing [id]>`
}

/** Non-streaming xAI chat call for digests / assisted search. */
export async function callXai({ apiKey, model, system, user, maxTokens }) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 55_000)
  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.6,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const err = new Error(`xAI returned ${res.status}`)
      err.status = res.status
      throw err
    }
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content?.trim()
    if (!content) throw new Error('Empty xAI response')
    return content
  } finally {
    clearTimeout(timeoutId)
  }
}
