// GET /api/cron/weekly-digest — Vercel Cron trigger for the weekly brief.
// Protected with CRON_SECRET (Authorization: Bearer <secret>). Iterates
// stored sessions, syncs recent saves (bounded), and stores a fresh Grok
// digest per user. Emailing is out of scope — digests are read in the app.

import crypto from 'node:crypto'
import { kv } from '@vercel/kv'
import { decryptTokens, requireSessionSecret, sessionKey } from '../_lib/session.js'
import { parseStoredPost } from '../_lib/posts.js'
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

  // Load + decrypt every session, then dedupe by X user: one user with N
  // browser sessions gets exactly one paid sync+digest, not N.
  const loaded = []
  for (const full of sessionIds) {
    const sid = String(full).split(':').pop()
    let sealed = null
    try {
      sealed = await kv.get(sessionKey(sid))
    } catch {
      continue
    }
    if (!sealed) continue
    try {
      const bundle = decryptTokens(secret, sealed)
      if (bundle?.xUserId) loaded.push({ sid, bundle })
    } catch {
      await kv.del(sessionKey(sid)).catch(() => {})
    }
  }
  const users = dedupeSessionsByUser(loaded)

  const results = []
  // No silent user cap: iterate every user, but stop visibly before the
  // function timeout and report exactly what was (and wasn't) processed.
  const startedAt = Date.now()
  const BUDGET_MS = 50_000
  const week = cronWeekKey()
  let stoppedEarly = false
  for (const [uid, entry] of users) {
    if (Date.now() - startedAt > BUDGET_MS) {
      stoppedEarly = true
      break
    }
    // Idempotency: one digest per user per week. NX-claim the marker; a
    // claimed week is skipped visibly, and the claim is released only when
    // processing throws unexpectedly (so a later run can retry).
    const marker = digestWeekKey(uid, week)
    let claimed = false
    try {
      claimed = (await kv.set(marker, entry.sid, { nx: true, ex: 8 * 24 * 3600 })) === 'OK'
    } catch {
      claimed = false
    }
    if (!claimed) {
      results.push({ uid, ok: true, skipped: 'already-briefed-this-week' })
      continue
    }
    try {
      const outcome = await digestOneSession({ sid: entry.sid, bundle: entry.bundle, secret, apiKey })
      results.push({ uid, ...outcome })
    } catch (err) {
      await kv.del(marker).catch(() => {})
      results.push({ uid, ok: false, error: err?.message || 'failed' })
    }
  }
  return res.json({
    ok: true,
    totalSessions: sessionIds.length,
    totalUsers: users.size,
    processed: results.filter(r => !r.skipped).length,
    skipped: results.filter(r => r.skipped).length,
    stoppedEarly,
    results,
  })
}

/** Monday-anchored UTC week key (matches the Monday cron schedule). */
export function cronWeekKey(date = new Date()) {
  const t = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7))
  return t.toISOString().slice(0, 10)
}

export function digestWeekKey(uid, week) {
  return `tf:digest:week:${uid}:${week}`
}

/** First session wins per X user id; stable uid order. */
export function dedupeSessionsByUser(entries) {
  const users = new Map()
  for (const e of entries) {
    if (!users.has(e.bundle.xUserId)) users.set(e.bundle.xUserId, e)
  }
  return new Map([...users.entries()].sort(([a], [b]) => (a < b ? -1 : 1)))
}

async function digestOneSession({ sid, bundle, secret, apiKey }) {

  if (bundle.refreshToken && Date.now() > (bundle.expiresAt || 0) - 60_000) {
    // Single shared refresh path (KV-locked): concurrent cron/request
    // refreshes can't burn the rotated token.
    const result = await refreshSessionTokens({ sid, secret, bundle })
    if (result.ok === false) return { ok: false, error: 'refresh failed' }
    bundle = result.bundle
  }

  const knownIds = new Set(await kv.hkeys(bookmarksKey(bundle.xUserId)).catch(() => []))
  const costPerPost = bookmarkCostPerPost()
  // Budget before paid work: skip the fetch AND the digest when the
  // remaining cap can't cover a full bounded sync.
  const preflight = await chargeSpend({
    kv,
    reads: SYNC_PAGES * 100,
    costPerPostUsd: costPerPost,
    dryRun: true,
  })
  if (!preflight.ok) {
    return { ok: false, error: 'spend_cap', skipped: 'budget-preflight-failed' }
  }
  const { fresh, fetched } = await fetchAllBookmarks({
    accessToken: bundle.accessToken,
    userId: bundle.xUserId,
    knownIds,
    maxPages: SYNC_PAGES,
  })
  // Record what X actually returned (force: the read already happened).
  await chargeSpend({ kv, reads: fetched, costPerPostUsd: costPerPost, force: true })
  if (fresh.length > 0) {
    const pipeline = kv.pipeline()
    for (const p of fresh) {
      pipeline.hset(bookmarksKey(bundle.xUserId), { [p.id]: JSON.stringify(p) })
    }
    await pipeline.exec().catch(() => {})
  }

  const stored = (await kv.hgetall(bookmarksKey(bundle.xUserId)).catch(() => null)) || {}
  const posts = Object.values(stored)
    .map(parseStoredPost)
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
  try {
    await kv.set(digestKey(bundle.xUserId), {
      text,
      createdAt: new Date().toISOString(),
      postCount: Math.min(40, posts.length),
      model: resolveForgeModel(undefined).model,
      via: 'cron',
    })
  } catch {
    return { ok: false, error: 'digest_store_failed' }
  }
  await kv
    .set(metaKey(bundle.xUserId), { lastSyncAt: new Date().toISOString(), totalCount: posts.length })
    .catch(() => {})
  return { ok: true, newPosts: fresh.length, total: posts.length }
}
