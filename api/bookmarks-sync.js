// POST /api/bookmarks-sync — pull the signed-in user's X bookmarks into KV.
// Pagination: 100/page via fetchAllBookmarks. Re-syncs dedupe against stored
// ids so only new saves are written. Reads charge the shared monthly spend
// cap at bookmarkCostPerPost() ($0.001 owned, $0.005 otherwise).

import { kv } from '@vercel/kv'
import { loadSession, sessionHint } from './_lib/auth.js'
import { checkAppToken, isAllowedOrigin } from './_lib/guard.js'
import { bookmarkCostPerPost, fetchAllBookmarks, fetchBookmarkFolders } from './_lib/xapi.js'
import {
  bookmarksKey,
  chargeSpend,
  foldersKey,
  kvConfigured,
  metaKey,
  spendCapCents,
} from './_lib/spend.js'

const MAX_PAGES = 5

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' })
  }
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({
      error: 'Cross-origin sync blocked',
      code: 'origin_forbidden',
      hint: 'Sync from the deployed app itself (same origin).',
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
      hint: 'Bind Vercel KV (KV_REST_API_URL, KV_REST_API_TOKEN) to persist synced bookmarks.',
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
  const { bundle } = session
  if (!bundle.xUserId) {
    return res.status(400).json({
      error: 'X user id unknown',
      code: 'x_user_unknown',
      hint: 'Sign out and sign in again so the app can read your X user id.',
    })
  }

  const knownIds = new Set(await kv.hkeys(bookmarksKey(bundle.xUserId)).catch(() => []))
  const costPerPost = bookmarkCostPerPost()
  // Preflight the worst case (MAX_PAGES × 100) so a sync never starts when
  // the remaining budget can't cover it; the post-sync charge uses actuals.
  const preflight = await chargeSpend({ kv, reads: MAX_PAGES * 100, costPerPostUsd: costPerPost, dryRun: true })
  if (!preflight.ok) {
    return res.status(402).json({
      error: 'Monthly X budget cap reached',
      code: 'spend_cap',
      hint: `Cap reached. Wait until next month or raise X_SPEND_CAP_USD.`,
    })
  }

  let fresh = []
  let fetched = 0
  try {
    const result = await fetchAllBookmarks({
      accessToken: bundle.accessToken,
      userId: bundle.xUserId,
      knownIds,
      maxPages: MAX_PAGES,
    })
    fresh = result.fresh
    fetched = result.fetched
  } catch (err) {
    const status = err?.status || 502
    if (status === 401) {
      return res.status(401).json({
        error: 'X denied bookmark access',
        code: 'bookmarks_unauthorized',
        hint: 'Your X token lacks bookmark.read or was revoked. Sign out and sign in again.',
      })
    }
    if (status === 429) {
      return res.status(429).json({
        error: 'X rate limited bookmark reads',
        code: 'bookmarks_rate_limit',
        hint: 'Wait a few minutes, then sync again.',
      })
    }
    return res.status(status >= 400 && status < 600 ? status : 502).json({
      error: 'Bookmark sync failed',
      code: 'bookmarks_sync_failed',
      hint: err?.message || 'Check Vercel logs and X API status.',
    })
  }

  const charged = await chargeSpend({ kv, reads: fetched, costPerPostUsd: costPerPost })
  if (!charged.ok) {
    return res.status(402).json({
      error: 'Monthly X budget cap reached',
      code: 'spend_cap',
      hint: 'Cap reached mid-sync. Already-fetched posts were kept; raise X_SPEND_CAP_USD to continue.',
    })
  }

  if (fresh.length > 0) {
    const pipeline = kv.pipeline()
    for (const p of fresh) {
      pipeline.hset(bookmarksKey(bundle.xUserId), { [p.id]: JSON.stringify(p) })
    }
    await pipeline.exec().catch(() => {})
  }

  let folders = []
  try {
    folders = await fetchBookmarkFolders({ accessToken: bundle.accessToken, userId: bundle.xUserId })
    if (folders.length > 0) {
      await kv.set(foldersKey(bundle.xUserId), folders).catch(() => {})
    }
  } catch {
    folders = (await kv.get(foldersKey(bundle.xUserId)).catch(() => null)) || []
  }

  const total = knownIds.size + fresh.length
  await kv
    .set(metaKey(bundle.xUserId), { lastSyncAt: new Date().toISOString(), totalCount: total })
    .catch(() => {})

  return res.json({
    ok: true,
    fetched,
    newPosts: fresh.length,
    total,
    folders: folders.length,
    costPerPostUsd: costPerPost,
    spendCapUsd: spendCapCents() / 100,
  })
}
