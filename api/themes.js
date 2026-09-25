// /api/themes — data-driven theme discovery over the owner's saves.
// GET returns the cached snapshot. POST recomputes lexical clusters, reuses
// cached Grok labels, and makes ONE batched Grok call for genuinely new
// clusters + ungrouped leftovers. Re-syncs therefore cost ~nothing: only
// new/changed clusters consume Grok tokens.

import crypto from 'node:crypto'
import { kv } from '@vercel/kv'
import { loadSession, sessionHint } from './_lib/auth.js'
import { checkAppToken, clampMaxTokens, isAllowedOrigin, resolveForgeModel } from './_lib/guard.js'
import {
  diffThemeLabels,
  discoverThemes,
} from './_lib/themes.js'
import {
  bookmarksKey,
  callXai,
  kvConfigured,
  themeLabelsKey,
  themesKey,
} from './_lib/spend.js'

const LABEL_CAP = 15
const LEFTOVER_CAP = 40
const NEW_THEME_CAP = 8
const SAMPLE_CHARS = 160

function themeId(seed) {
  return `t-${crypto.createHash('sha1').update(seed).digest('hex').slice(0, 8)}`
}

function cleanName(raw, fallback) {
  const name = String(raw || '').trim().replace(/^["“]|["”]$/g, '').slice(0, 60)
  if (!name || name.split(/\s+/).length > 6) return fallback
  return name
}

function trunc(text, n = SAMPLE_CHARS) {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

function parsePost(value) {
  try {
    const p = typeof value === 'string' ? JSON.parse(value) : value
    if (!p || typeof p.id === 'undefined') return null
    return { ...p, id: String(p.id) }
  } catch {
    return null
  }
}

const LABEL_SYSTEM = `You name and place saved X posts into themes. Reply with ONLY a JSON object, no prose, no code fences.`

function buildLabelPrompt({ needsLabeling, leftovers, existingNames, byId }) {
  const clusters = needsLabeling.slice(0, LABEL_CAP).map(c => ({
    sig: c.sig,
    hint: c.topTerms.join(', '),
    samples: c.postIds.slice(0, 3).map(id => `[${id}] ${trunc(byId.get(id)?.text)}`),
  }))
  const loose = leftovers.slice(0, LEFTOVER_CAP).map(id => `[${id}] ${trunc(byId.get(id)?.text)}`)
  return `Group these saved X posts into themes. Name each theme in 5 words or fewer.
Existing themes (prefer joining one over creating a near-duplicate): ${existingNames.join('; ') || '(none)'}.

New clusters to name:
${JSON.stringify(clusters)}

Ungrouped saves — place each into a cluster sig, an existing theme name, or NEW:
${JSON.stringify(loose)}

Reply JSON exactly:
{"labels":[{"sig":"...","name":"..."}],"placements":{"<postId>":"<sig|theme name|NEW>"},"newThemes":[{"name":"...","postIds":["..."]}]}`
}

function safeJson(text) {
  try {
    return JSON.parse(String(text).trim().replace(/^```json|```$/g, '').trim())
  } catch {
    return null
  }
}

export default async function handler(req, res) {
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({
      error: 'Cross-origin request blocked',
      code: 'origin_forbidden',
      hint: 'Discover themes from the deployed app itself (same origin).',
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
      error: 'Theme store not configured',
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
    const snapshot = await kv.get(themesKey(uid)).catch(() => null)
    if (!snapshot) {
      return res.status(404).json({
        error: 'No themes yet',
        code: 'themes_missing',
        hint: 'Discover themes first — cached afterwards, so re-syncs stay cheap.',
      })
    }
    return res.json(snapshot)
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' })
  }

  const stored = (await kv.hgetall(bookmarksKey(uid)).catch(() => null)) || {}
  const posts = Object.values(stored)
    .map(parsePost)
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
  if (posts.length === 0) {
    return res.status(400).json({
      error: 'No saved bookmarks to theme',
      code: 'themes_empty',
      hint: 'Sync bookmarks first, then discover themes.',
    })
  }

  const byId = new Map(posts.map(p => [p.id, p]))
  const { themes: lexical, leftoverIds } = discoverThemes(posts, { threshold: 0.12 })
  const labelCache = (await kv.get(themeLabelsKey(uid)).catch(() => null)) || {}
  const { labeled, needsLabeling } = diffThemeLabels(labelCache, lexical)

  const apiKey = String(process.env.XAI_API_KEY || '').trim()
  const pendingLeftovers = leftoverIds.filter(id => byId.has(id)).slice(0, LEFTOVER_CAP)
  const existingNames = labeled.map(t => t.name)

  // Fast path: everything cached and nothing ungrouped — zero Grok cost.
  let grok = null
  if (apiKey && (needsLabeling.length > 0 || pendingLeftovers.length > 0)) {
    try {
      const text = await callXai({
        apiKey,
        model: resolveForgeModel(undefined).model,
        system: LABEL_SYSTEM,
        user: buildLabelPrompt({ needsLabeling, leftovers: pendingLeftovers, existingNames, byId }),
        maxTokens: clampMaxTokens(800),
      })
      grok = safeJson(text)
    } catch {
      grok = null
    }
  }

  // Merge labels: Grok names win, heuristic names cover the rest.
  const nameBySig = new Map()
  for (const t of labeled) nameBySig.set(t.sig, t.name)
  const freshLabels = {}
  if (grok && Array.isArray(grok.labels)) {
    for (const l of grok.labels.slice(0, LABEL_CAP)) {
      const target = needsLabeling.find(c => c.sig === l?.sig) || lexical.find(c => c.sig === l?.sig)
      if (!target) continue
      const name = cleanName(l?.name, target.name)
      nameBySig.set(target.sig, name)
      freshLabels[target.sig] = { name, model: resolveForgeModel(undefined).model, at: new Date().toISOString() }
    }
  }
  for (const c of needsLabeling) {
    if (!nameBySig.has(c.sig)) nameBySig.set(c.sig, c.name)
  }

  // Merge placements for leftovers: Grok sig/theme/NEW, else "More saves".
  const sigByName = new Map()
  for (const [sig, name] of nameBySig) sigByName.set(String(name).toLowerCase(), sig)
  const newThemes = []
  if (grok && Array.isArray(grok.newThemes)) {
    for (const nt of grok.newThemes.slice(0, NEW_THEME_CAP)) {
      const ids = (nt?.postIds || []).map(String).filter(id => pendingLeftovers.includes(id))
      if (ids.length === 0) continue
      newThemes.push({ name: cleanName(nt?.name, 'More saves'), postIds: ids })
    }
  }
  const placedNew = new Set(newThemes.flatMap(t => t.postIds))
  const placements = {}
  if (grok && grok.placements && typeof grok.placements === 'object') {
    for (const [pid, dest] of Object.entries(grok.placements)) {
      if (!pendingLeftovers.includes(pid) || placedNew.has(pid)) continue
      const d = String(dest)
      if (nameBySig.has(d)) placements[pid] = d
      else if (sigByName.has(d.toLowerCase())) placements[pid] = sigByName.get(d.toLowerCase())
    }
  }

  const outThemes = []
  const themeBySig = new Map()
  const allClusters = [...labeled, ...needsLabeling]
  for (const c of allClusters) {
    const extra = pendingLeftovers.filter(id => placements[id] === c.sig)
    const postIds = [...c.postIds, ...extra]
    const sig = c.sig
    const theme = {
      id: themeId(sig),
      name: nameBySig.get(sig) || c.name,
      count: postIds.length,
      postIds,
      source: freshLabels[sig] ? 'grok' : labelCache[sig] ? 'grok' : 'heuristic',
    }
    outThemes.push(theme)
    themeBySig.set(sig, theme)
  }
  for (const nt of newThemes) {
    outThemes.push({
      id: themeId(`new:${nt.name}:${[...nt.postIds].sort().join(',')}`),
      name: nt.name,
      count: nt.postIds.length,
      postIds: [...nt.postIds],
      source: 'grok',
    })
  }
  const assigned = new Set(outThemes.flatMap(t => t.postIds))
  const moreIds = posts.map(p => p.id).filter(id => !assigned.has(id))
  if (moreIds.length > 0) {
    outThemes.push({
      id: 't-more-saves',
      name: 'More saves',
      count: moreIds.length,
      postIds: moreIds,
      source: 'heuristic',
    })
  }
  outThemes.sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1))

  if (Object.keys(freshLabels).length > 0) {
    await kv.hset(themeLabelsKey(uid), freshLabels).catch(() => {})
  }
  const snapshot = {
    themes: outThemes,
    updatedAt: new Date().toISOString(),
    postCount: posts.length,
    grokLabeled: outThemes.filter(t => t.source === 'grok').length,
  }
  await kv.set(themesKey(uid), snapshot).catch(() => {})
  return res.json(snapshot)
}
