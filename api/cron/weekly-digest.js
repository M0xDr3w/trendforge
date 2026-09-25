// GET /api/cron/weekly-digest — Vercel Cron trigger for the weekly brief.
// Protected with CRON_SECRET (Authorization: Bearer <secret>). Iterates
// stored sessions, syncs recent saves (bounded), and stores a fresh Grok
// digest per user. Emailing is out of scope — digests are read in the app.

import crypto from 'node:crypto'
import { kv } from '@vercel/kv'
import { decryptTokens, requireSessionSecret, sessionKey } from '../_lib/session.js'
import { refreshSessionTokens } from '../_lib/auth.js'
import { fetchAllBookmarks, bookmarkCostPerPost } from '../_lib/xapi.js'
import {
  bookmarksKey,
  buildDigestPrompt,
  callXai,
  chargeSpend,
  digestKey,
  kvConfigured,
  metaKey,
  themesKey,
} from '../_lib/spend.js'
import { clampMaxTokens, resolveForgeModel } from '../_lib/guard.js'

const SYNC_PAGES = 2

function authorized(req) {
  const secret = String(process.env.CRON_SECRET || '')
  if (!secret) return false
  const header = String(req.headers?.authorization || '')
  const m = header.match(/^Bearer\s+(.+)$/i)
  if (!m) return false
  // Constant-time compare on fixed-length hashes: no length leak, no
  // short-circuit equality. timingSafeEqual throws on length mismatch, so
  // hash both sides first.
  const presented = crypto.createHash('sha256').update(m[1].trim()).digest()
  const expected = crypto.createHash('sha256').update(secret).digest()
  return crypto.timingSafeEqual(presented, expected)
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' })
  }
  if (!authorized(req)) {
    return res.status(401).json({
      error: 'Cron unauthorized',
      code: 'cron_unauthorized',
      hint: 'Call with Authorization: Bearer CRON_SECRET. Vercel Cron sends it automatically when configured.',
    })
  }
  if (!kvConfigured()) {
    return res.status(500).json({
      error: 'Digest store not configured',
      code: 'bookmark_store_missing',
      hint: 'Bind Vercel KV.',
    })
  }
  const secret = requireSessionSecret()
  const apiKey = String(process.env.XAI_API_KEY || '').trim()
  if (!secret || !apiKey) {
    return res.status(500).json({
      error: 'Digest job not configured',
      code: 'cron_not_configured',
      hint: 'Set SESSION_SECRET and XAI_API_KEY in Vercel env.',
    })
  }

  let sessionIds = []
  try {
    sessionIds = await kv.keys('tf:sess:*')
  } catch {
    return res.status(500).json({
      error: 'Could not list sessions',
      code: 'cron_store_failed',
      hint: 'KV KEYS failed. Retry on the next schedule.',
    })
  }

  const results = []
  // No silent user cap: iterate every session, but stop visibly before the
  // function timeout and report exactly what was (and wasn't) processed.
  const startedAt = Date.now()
  const BUDGET_MS = 50_000
  let stoppedEarly = false
  for (const full of sessionIds) {
    if (Date.now() - startedAt > BUDGET_MS) {
      stoppedEarly = true
      break
    }
    const sid = String(full).split(':').pop()
    try {
      const outcome = await digestOneSession({ sid, secret, apiKey })
      results.push({ sid: `${sid.slice(0, 6)}…`, ...outcome })
    } catch (err) {
      results.push({ sid: `${sid.slice(0, 6)}…`, ok: false, error: err?.message || 'failed' })
    }
  }
  return res.json({
    ok: true,
    totalSessions: sessionIds.length,
    processed: results.length,
    skipped: sessionIds.length - results.length,
    stoppedEarly,
    results,
  })
}

async function digestOneSession({ sid, secret, apiKey }) {
  const sealed = await kv.get(sessionKey(sid))
  if (!sealed) return { ok: false, error: 'session gone' }
  let bundle
  try {
    bundle = decryptTokens(secret, sealed)
  } catch {
    await kv.del(sessionKey(sid)).catch(() => {})
    return { ok: false, error: 'session undecryptable, removed' }
  }
  if (!bundle.xUserId) return { ok: false, error: 'no x user id' }

  if (bundle.refreshToken && Date.now() > (bundle.expiresAt || 0) - 60_000) {
    // Single shared refresh path (KV-locked): concurrent cron/request
    // refreshes can't burn the rotated token.
    const result = await refreshSessionTokens({ sid, secret, bundle })
    if (result.ok === false) return { ok: false, error: 'refresh failed' }
    bundle = result.bundle
  }

  const knownIds = new Set(await kv.hkeys(bookmarksKey(bundle.xUserId)).catch(() => []))
  const { fresh, fetched } = await fetchAllBookmarks({
    accessToken: bundle.accessToken,
    userId: bundle.xUserId,
    knownIds,
    maxPages: SYNC_PAGES,
  })
  await chargeSpend({ kv, reads: fetched, costPerPostUsd: bookmarkCostPerPost() })
  if (fresh.length > 0) {
    const pipeline = kv.pipeline()
    for (const p of fresh) {
      pipeline.hset(bookmarksKey(bundle.xUserId), { [p.id]: JSON.stringify(p) })
    }
    await pipeline.exec().catch(() => {})
  }

  const stored = (await kv.hgetall(bookmarksKey(bundle.xUserId)).catch(() => null)) || {}
  const posts = Object.values(stored)
    .map(v => {
      try {
        return JSON.parse(v)
      } catch {
        return null
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
  if (posts.length === 0) return { ok: false, error: 'no bookmarks' }

  const snapshot = await kv.get(themesKey(bundle.xUserId)).catch(() => null)
  const themes = Array.isArray(snapshot?.themes) ? snapshot.themes : []
  const text = await callXai({
    apiKey,
    model: resolveForgeModel(undefined).model,
    system: 'You are a SpaceXAI briefing writer. Reply in Markdown.',
    user: buildDigestPrompt(posts, themes),
    maxTokens: clampMaxTokens(900),
  })
  await kv
    .set(digestKey(bundle.xUserId), {
      text,
      createdAt: new Date().toISOString(),
      postCount: Math.min(40, posts.length),
      model: resolveForgeModel(undefined).model,
      via: 'cron',
    })
    .catch(() => {})
  await kv
    .set(metaKey(bundle.xUserId), { lastSyncAt: new Date().toISOString(), totalCount: posts.length })
    .catch(() => {})
  return { ok: true, newPosts: fresh.length, total: posts.length }
}
