// GET /api/bookmarks — list saved bookmarks from KV (session-gated).
// Query: q (keyword), folder (folder id), limit (default 50, max 200),
// ask (optional Grok-assisted relevance filter over the keyword subset).

import { kv } from '@vercel/kv'
import { loadSession, sessionHint } from './_lib/auth.js'
import { checkAppToken, isAllowedOrigin } from './_lib/guard.js'
import { bookmarksKey, foldersKey, kvConfigured } from './_lib/spend.js'
import { clampMaxTokens, resolveForgeModel } from './_lib/guard.js'
import { callXai } from './_lib/spend.js'

const ASSIST_SYSTEM = `You rank saved X posts by relevance to a question. Reply with ONLY a JSON array of the save ids you judge relevant, most relevant first. No prose, no code fences.`

function parsePost(value) {
  try {
    const p = typeof value === 'string' ? JSON.parse(value) : value
    if (!p || typeof p.id === 'undefined') return null
    return { ...p, id: String(p.id) }
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' })
  }
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({
      error: 'Cross-origin request blocked',
      code: 'origin_forbidden',
      hint: 'Read bookmarks from the deployed app itself (same origin).',
    })
  }
  if (!checkAppToken(req)) {
    return res.status(401).json({
      error: 'App access token required',
      code: 'app_unauthorized',
      hint: 'Paste the matching token in the app session field.',
    })
  }
  if (!kvConfigured()) {
    return res.status(500).json({
      error: 'Bookmark store not configured',
      code: 'bookmark_store_missing',
      hint: 'Bind Vercel KV (KV_REST_API_URL, KV_REST_API_TOKEN).',
    })
  }

  const session = await loadSession(req)
  if (!session.ok) {
    const status = session.code === 'session_store_failed' ? 500 : 401
    return res.status(status).json({
      error: session.error,
      code: session.code,
      hint: sessionHint(session.code),
    })
  }
  const uid = session.bundle.xUserId
  if (!uid) {
    return res.status(400).json({
      error: 'X user id unknown',
      code: 'x_user_unknown',
      hint: 'Sign out and sign in again.',
    })
  }

  const q = String(req.query?.q || '').trim().toLowerCase()
  const folder = String(req.query?.folder || '').trim()
  const limit = Math.min(200, Math.max(1, Number.parseInt(req.query?.limit, 10) || 50))
  const ask = String(req.query?.ask || '').trim()

  let stored
  try {
    stored = (await kv.hgetall(bookmarksKey(uid))) || {}
  } catch {
    return res.status(500).json({
      error: 'Could not read bookmarks',
      code: 'bookmarks_read_failed',
      hint: 'Vercel KV is unreachable. Retry in a moment.',
    })
  }
  let posts = Object.values(stored).map(parsePost).filter(Boolean)

  if (folder) {
    posts = posts.filter(p => (p.folderIds || []).includes(folder))
  }
  if (q) {
    posts = posts.filter(
      p =>
        p.text.toLowerCase().includes(q) ||
        String(p.username || '').toLowerCase().includes(q),
    )
  }
  posts.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))

  const folders = (await kv.get(foldersKey(uid)).catch(() => null)) || []
  const total = Object.keys(stored).length

  // Grok-assisted relevance: rank the (already keyword-filtered) subset.
  let assisted = false
  if (ask && posts.length > 0) {
    const apiKey = String(process.env.XAI_API_KEY || '').trim()
    if (!apiKey) {
      return res.status(503).json({
        error: 'Grok-assisted search needs XAI_API_KEY',
        code: 'missing_xai_key',
        hint: 'Set XAI_API_KEY in Vercel env, or omit ?ask= for plain keyword search.',
      })
    }
    const subset = posts.slice(0, 30)
    const listing = subset.map(p => `- [${p.id}] @${p.username}: ${p.text.slice(0, 280)}`).join('\n')
    try {
      const ranked = await callXai({
        apiKey,
        model: resolveForgeModel(undefined).model,
        system: ASSIST_SYSTEM,
        user: `Question: ${ask}\n\nSaves:\n${listing}`,
        maxTokens: Math.min(600, clampMaxTokens(600)),
      })
      const ids = JSON.parse(ranked.trim().replace(/^```json|```$/g, '').trim())
      if (Array.isArray(ids)) {
        const rank = new Map(ids.map((id, i) => [String(id), i]))
        posts = subset
          .filter(p => rank.has(p.id))
          .sort((a, b) => rank.get(a.id) - rank.get(b.id))
        assisted = true
      }
    } catch {
      // Fall through to keyword results on any assist failure.
    }
  }

  return res.json({
    posts: posts.slice(0, limit),
    total,
    folders,
    assisted,
  })
}
