// POST /api/bookmarks-sync — pull the signed-in user's X bookmarks into KV.
// Pagination: 100/page via fetchAllBookmarks. Re-syncs dedupe against stored
// ids so only new saves are written. Reads charge the shared monthly spend
// cap at bookmarkCostPerPost() ($0.001 owned, $0.005 otherwise).

import { kv } from '@vercel/kv'
import { loadSession, sessionHint } from './_lib/auth.js'
import { checkAppToken, checkRateLimit, isAllowedOrigin, rateLimitConfig } from './_lib/guard.js'
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
    const status = session.status ?? 500
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

  // Per-session sync budget: each sync can burn up to MAX_PAGES×100 reads
  // plus a folder listing, so anonymous-style unlimited syncing is out.
  const { limit: syncLimit, windowSec: syncWindow } = rateLimitConfig('SYNC_SESS', 10, 3600)
  const syncRate = await checkRateLimit({
    kv,
    prefix: 'bm:ratelimit:sess',
    ip: session.sid,
    limit: syncLimit,
    windowSec: syncWindow,
  })
  if (!syncRate.allowed) {
    return res.status(429).json({
      error: 'Bookmark sync rate limit exceeded',
      code: 'sync_rate_limit',
      hint: `Sync is limited to ${syncLimit}/hour per session — the last sync already stored everything new.`,
    })
  }

  const knownIds = new Set(await kv.hkeys(bookmarksKey(bundle.xUserId)).catch(() => []))
  const costPerPost = bookmarkCostPerPost()
  // Preflight the worst case (MAX_PAGES × 100 + one folder listing) so a
  // sync never starts when the remaining budget can't cover it; the
  // post-sync charge records actuals.
  const preflight = await chargeSpend({
    kv,
    reads: MAX_PAGES * 100 + 1,
    costPerPostUsd: costPerPost,
    dryRun: true,
  })
  if (!preflight.ok) {
    if (preflight.code === 'spend_store_failed') {
      return res.status(500).json({
        error: 'Spend store unreachable',
        code: 'spend_store_failed',
        hint: 'Vercel KV did not respond. Check KV env vars and retry.',
      })
    }
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

  let folders = []
  let foldersReads = 0
  try {
    folders = await fetchBookmarkFolders({ accessToken: bundle.accessToken, userId: bundle.xUserId })
    foldersReads = 1
    if (folders.length > 0) {
      await kv.set(foldersKey(bundle.xUserId), folders).catch(() => {})
    }
  } catch {
    folders = (await kv.get(foldersKey(bundle.xUserId)).catch(() => null)) || []
  }

  // The X reads already happened: always record actuals (force) and always
  // persist what X returned. A blown cap is reported as a flag on the
  // result — never as dropped posts or unrecorded spend.
  const charged = await chargeSpend({
    kv,
    reads: fetched + foldersReads,
    costPerPostUsd: costPerPost,
    force: true,
  })

  if (fresh.length > 0) {
    const pipeline = kv.pipeline()
    for (const p of fresh) {
      pipeline.hset(bookmarksKey(bundle.xUserId), { [p.id]: JSON.stringify(p) })
    }
    await pipeline.exec().catch(() => {})
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
    capReached: !charged.ok,
    ...(charged.ok
      ? {}
      : { capHint: 'Monthly X budget cap reached by this sync. Already-fetched posts were kept; raise X_SPEND_CAP_USD.' }),
  })
}
