// /api/digest — weekly Grok brief over saved bookmarks.
// GET returns the latest stored digest. POST generates a new one from the
// newest saves (session-gated, Grok model allowlist + token cap apply).

import { kv } from '@vercel/kv'
import { loadSession, sessionHint } from './_lib/auth.js'
import { checkAppToken, clampMaxTokens, isAllowedOrigin, resolveForgeModel } from './_lib/guard.js'
import { parseStoredPost } from './_lib/posts.js'
import {
  bookmarksKey,
  buildDigestPrompt,
  callXai,
  digestKey,
  kvConfigured,
  themesKey,
} from './_lib/spend.js'

async function readPosts(uid) {
  const stored = (await kv.hgetall(bookmarksKey(uid)).catch(() => null)) || {}
  return Object.values(stored)
    .map(parseStoredPost)
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
}

export default async function handler(req, res) {
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({
      error: 'Cross-origin request blocked',
      code: 'origin_forbidden',
      hint: 'Open the digest from the deployed app itself (same origin).',
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
      error: 'Digest store not configured',
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

  if (req.method === 'GET') {
    const digest = await kv.get(digestKey(uid)).catch(() => null)
    if (!digest) {
      return res.status(404).json({
        error: 'No digest yet',
        code: 'digest_missing',
        hint: 'Generate one — it also refreshes every Monday via the cron route.',
      })
    }
    return res.json(digest)
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' })
  }

  const apiKey = String(process.env.XAI_API_KEY || '').trim()
  if (!apiKey) {
    return res.status(503).json({
      error: 'XAI_API_KEY not configured',
      code: 'missing_xai_key',
      hint: 'Set XAI_API_KEY in Vercel env (Production + Preview), then redeploy.',
    })
  }

  const posts = await readPosts(uid)
  if (posts.length === 0) {
    return res.status(400).json({
      error: 'No saved bookmarks to brief',
      code: 'digest_empty',
      hint: 'Sync bookmarks first, then generate the digest.',
    })
  }

  // Organize the brief around discovered themes when present.
  const snapshot = await kv.get(themesKey(uid)).catch(() => null)
  const themes = Array.isArray(snapshot?.themes) ? snapshot.themes : []

  let text
  try {
    text = await callXai({
      apiKey,
      model: resolveForgeModel(req.body?.model).model,
      system: 'You are a SpaceXAI briefing writer. Reply in Markdown.',
      user: buildDigestPrompt(posts, themes),
      maxTokens: clampMaxTokens(req.body?.max_tokens ?? 900),
    })
  } catch (err) {
    const status = err?.status || 502
    return res.status(status >= 400 && status < 600 ? status : 502).json({
      error: 'Digest generation failed',
      code: 'digest_failed',
      hint: err?.message || 'xAI unreachable. Retry in a moment.',
    })
  }

  const digest = {
    text,
    createdAt: new Date().toISOString(),
    postCount: Math.min(40, posts.length),
    model: resolveForgeModel(req.body?.model).model,
  }
  await kv.set(digestKey(uid), digest).catch(() => {})
  return res.json(digest)
}
