// GET /api/cron/weekly-digest — Vercel Cron trigger for the weekly brief.
// Protected with CRON_SECRET (Authorization: Bearer <secret>). Iterates
// stored sessions, syncs recent saves (bounded), and stores a fresh Grok
// digest per user. Emailing is out of scope — digests are read in the app.

import { kv } from '@vercel/kv'
import { decryptTokens, encryptTokens, requireSessionSecret, sessionKey } from '../_lib/session.js'
import { refreshAccessToken } from '../_lib/xapi.js'
import { fetchAllBookmarks, bookmarkCostPerPost } from '../_lib/xapi.js'
import {
  bookmarksKey,
  buildDigestPrompt,
  callXai,
  chargeSpend,
  digestKey,
  kvConfigured,
  metaKey,
} from '../_lib/spend.js'
import { clampMaxTokens, resolveForgeModel } from '../_lib/guard.js'

const SYNC_PAGES = 2

function authorized(req) {
  const secret = String(process.env.CRON_SECRET || '')
  if (!secret) return false
  const header = String(req.headers?.authorization || '')
  const m = header.match(/^Bearer\s+(.+)$/i)
  return !!m && m[1].trim().length === secret.length && m[1].trim() === secret
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
  for (const full of sessionIds.slice(0, 25)) {
    const sid = String(full).split(':').pop()
    try {
      const outcome = await digestOneSession({ sid, secret, apiKey })
      results.push({ sid: `${sid.slice(0, 6)}…`, ...outcome })
    } catch (err) {
      results.push({ sid: `${sid.slice(0, 6)}…`, ok: false, error: err?.message || 'failed' })
    }
  }
  return res.json({ ok: true, sessions: results.length, results })
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
    try {
      const tokens = await refreshAccessToken({
        clientId: String(process.env.X_CLIENT_ID || '').trim(),
        clientSecret: String(process.env.X_CLIENT_SECRET || '').trim(),
        refreshToken: bundle.refreshToken,
      })
      bundle = {
        ...bundle,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || bundle.refreshToken,
        expiresAt: Date.now() + Number(tokens.expires_in || 7200) * 1000,
      }
      await kv.set(sessionKey(sid), encryptTokens(secret, bundle), { ex: 30 * 24 * 3600 })
    } catch {
      return { ok: false, error: 'refresh failed' }
    }
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

  const text = await callXai({
    apiKey,
    model: resolveForgeModel(undefined),
    system: 'You are a SpaceXAI briefing writer. Reply in Markdown.',
    user: buildDigestPrompt(posts),
    maxTokens: clampMaxTokens(900),
  })
  await kv
    .set(digestKey(bundle.xUserId), {
      text,
      createdAt: new Date().toISOString(),
      postCount: Math.min(40, posts.length),
      model: resolveForgeModel(undefined),
      via: 'cron',
    })
    .catch(() => {})
  await kv
    .set(metaKey(bundle.xUserId), { lastSyncAt: new Date().toISOString(), totalCount: posts.length })
    .catch(() => {})
  return { ok: true, newPosts: fresh.length, total: posts.length }
}
