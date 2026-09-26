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
 * Spend accounting against the shared monthly cap.
 *
 * - dryRun: read-only preflight. True when the remaining budget covers
 *   `reads`, without recording anything.
 * - default: atomic check-and-record. incrby first; when the new total
 *   exceeds the cap, decrby rolls back and the call is rejected. Concurrent
 *   overshoot is bounded to one increment each (use Lua for strictness).
 * - force: record-actuals mode for reads that already happened (the X call
 *   is sunk). Always increments; reports ok:false when now over the cap so
 *   callers can flag it instead of dropping data.
 */
export async function chargeSpend({ kv, reads, costPerPostUsd, dryRun = false, force = false }) {
  const key = monthKey()
  const capCents = spendCapCents()
  const capUsd = capCents / 100
  const period = key.split(':')[1]
  const planned = Math.ceil(reads * costPerPostUsd * 100)

  if (dryRun) {
    let current = 0
    try {
      current = Number((await kv.get(key)) || 0) || 0
    } catch {
      return { ok: false, code: 'spend_store_failed', capUsd, period }
    }
    if (current + planned > capCents) {
      return { ok: false, code: 'spend_cap', capUsd, period }
    }
    return { ok: true, capUsd, period }
  }

  if (planned <= 0) return { ok: true, capUsd, period }

  let total = 0
  try {
    total = Number(await kv.incrby(key, planned)) || 0
  } catch {
    return { ok: false, code: 'spend_store_failed', capUsd, period }
  }

  if (total > capCents) {
    if (!force) {
      try {
        await kv.decrby(key, planned)
      } catch {
        // Rollback failed: the preflight on the next call still gates spend.
      }
    }
    return { ok: false, code: 'spend_cap', capUsd, period, totalCents: total }
  }
  return { ok: true, capUsd, period, totalCents: total }
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

export function themesKey(uid) {
  return `tf:themes:${uid}`
}

export function themeLabelsKey(uid) {
  return `tf:theme-labels:${uid}`
}

export function buildDigestPrompt(posts, themes = []) {
  const byId = new Map(posts.map(p => [String(p.id), p]))
  const themed = new Set()
  const sections = []
  for (const t of themes.slice(0, 10)) {
    const members = (t.postIds || []).map(id => byId.get(String(id))).filter(Boolean)
    if (members.length === 0) continue
    members.forEach(m => themed.add(String(m.id)))
    sections.push(
      `### ${t.name} (${members.length})\n` +
        members
          .slice(0, 8)
          .map(p => `- [${p.id}] @${p.username}: ${String(p.text).slice(0, 220)}`)
          .join('\n'),
    )
  }
  const unthemed = posts.filter(p => !themed.has(String(p.id))).slice(0, 10)
  if (unthemed.length > 0) {
    sections.push(
      `### More saves (${unthemed.length})\n` +
        unthemed.map(p => `- [${p.id}] @${p.username}: ${String(p.text).slice(0, 220)}`).join('\n'),
    )
  }
  const lines = sections.join('\n\n')
  const total = posts.length
  return `Write a weekly brief over these ${total} saved X posts, organized by the discovered themes.

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
