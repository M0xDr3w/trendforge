// Bookmark Forge client domain: types, fixture data, API helpers, search,
// citation-aware forge prompts. Real bookmark content comes from the
// session-gated /api/bookmarks* routes; fixtures keep the UI explorable
// with zero keys and power the ?demo=bookmarks walkthrough.

import { appTokenHeaders } from './accessToken'

export interface BookmarkPost {
  id: string
  text: string
  username: string
  createdAt: string
  likes: number
  retweets: number
  folderIds?: string[]
}

export interface BookmarkFolder {
  id: string
  name: string
}

export interface WeeklyDigest {
  text: string
  createdAt: string
  postCount: number
  model?: string
}

export interface AuthStatus {
  signedIn: boolean
  username?: string | null
  expiresAt?: number | null
}

export interface SyncResult {
  ok: boolean
  fetched: number
  newPosts: number
  total: number
  folders: number
  costPerPostUsd?: number
}

export interface BookmarkListResult {
  posts: BookmarkPost[]
  total: number
  folders: BookmarkFolder[]
  assisted: boolean
}

interface ApiErrorPayload {
  error?: string
  code?: string
  hint?: string
}

export class BookmarkApiError extends Error {
  readonly code: string
  readonly hint: string

  constructor(code: string, message: string, hint: string) {
    super(message)
    this.name = 'BookmarkApiError'
    this.code = code
    this.hint = hint
  }
}

async function parseJson(res: Response): Promise<unknown> {
  return res.json().catch(() => ({}))
}

function toApiError(payload: ApiErrorPayload, fallback: string): BookmarkApiError {
  return new BookmarkApiError(
    payload.code || 'bookmark_error',
    payload.error || fallback,
    payload.hint || 'Check the connection and retry.',
  )
}

async function apiGet<T>(path: string, fallback: string): Promise<T> {
  const res = await fetch(path, { headers: { ...appTokenHeaders() } })
  const data = (await parseJson(res)) as ApiErrorPayload & T
  if (!res.ok) throw toApiError(data, fallback)
  return data as T
}

async function apiPost<T>(path: string, body: unknown, fallback: string): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...appTokenHeaders() },
    body: JSON.stringify(body ?? {}),
  })
  const data = (await parseJson(res)) as ApiErrorPayload & T
  if (!res.ok) throw toApiError(data, fallback)
  return data as T
}

export function getAuthStatus(): Promise<AuthStatus> {
  return apiGet<AuthStatus>('/api/auth/x-status', 'Could not check sign-in status')
}

export function startLogin(): void {
  window.location.href = '/api/auth/x-login'
}

export function logout(): Promise<{ ok: boolean }> {
  return apiPost('/api/auth/x-logout', {}, 'Sign-out failed')
}

export function syncBookmarks(): Promise<SyncResult> {
  return apiPost<SyncResult>('/api/bookmarks-sync', {}, 'Bookmark sync failed')
}

export function fetchBookmarks(options?: {
  q?: string
  folder?: string
  limit?: number
  ask?: string
}): Promise<BookmarkListResult> {
  const params = new URLSearchParams()
  if (options?.q) params.set('q', options.q)
  if (options?.folder) params.set('folder', options.folder)
  if (options?.limit) params.set('limit', String(options.limit))
  if (options?.ask) params.set('ask', options.ask)
  const suffix = params.toString() ? `?${params}` : ''
  return apiGet<BookmarkListResult>(`/api/bookmarks${suffix}`, 'Could not load bookmarks')
}

export function fetchDigest(): Promise<WeeklyDigest> {
  return apiGet<WeeklyDigest>('/api/digest', 'Could not load the weekly digest')
}

export function generateDigest(): Promise<WeeklyDigest> {
  return apiPost<WeeklyDigest>('/api/digest', {}, 'Digest generation failed')
}

/** Keyword search over saved bookmarks (client-side; the server mirrors it). */
export function searchBookmarks(posts: BookmarkPost[], query: string): BookmarkPost[] {
  const q = query.trim().toLowerCase()
  if (!q) return posts
  return posts.filter(
    p =>
      p.text.toLowerCase().includes(q) ||
      p.username.toLowerCase().includes(q),
  )
}

/** Merge newly synced posts: dedupe by id, newest first, capped. */
export function mergeBookmarks(
  existing: BookmarkPost[],
  incoming: BookmarkPost[],
  max = 300,
): BookmarkPost[] {
  const seen = new Set(existing.map(p => p.id))
  const additions = incoming.filter(p => !seen.has(p.id))
  if (additions.length === 0) return existing
  return [...additions, ...existing]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, max)
}

export function filterByFolder(posts: BookmarkPost[], folderId: string): BookmarkPost[] {
  if (!folderId) return posts
  return posts.filter(p => (p.folderIds || []).includes(folderId))
}

/**
 * Citation-aware forge prompt: every generated angle must cite the specific
 * saves it draws on, so threads stay grounded in what was actually saved.
 */
export function buildBookmarkForgePrompt(posts: BookmarkPost[], topic?: string): string {
  const subject = topic?.trim() || 'your saved bookmarks'
  const saves = posts
    .slice(0, 8)
    .map(p => `- [${p.id}] @${p.username}: ${p.text}`)
    .join('\n')
  return `Generate exactly 5 thread/post ideas from these saved X posts ("${subject}").

Saves:
${saves}

Hard rules:
- Every idea MUST cite at least one save as [@user] so the thread can link the source.
- Never invent engagement metrics or "viral" claims.
- Stay under ~40 words per idea.
- Human gates the ship — you propose; they decide.

Format (strict):
1. <idea> (via [@user])
2. <idea> (via [@user])
3. <idea> (via [@user])
4. <idea> (via [@user])
5. <idea> (via [@user])

Mix: at least one thread starter, one contrarian take, one curation roundup. No preamble or closing notes.`
}

// --- Fixtures (fictional accounts, invented text — demo/sample only) --------

export const FIXTURE_FOLDERS: BookmarkFolder[] = [
  { id: 'f-agents', name: 'Agents' },
  { id: 'f-craft', name: 'Craft' },
]

export const FIXTURE_BOOKMARKS: BookmarkPost[] = [
  {
    id: '201',
    text: 'Small agent loops beat big agent frameworks. Constrain the tools, log every step, let the human gate the ship.',
    username: 'sample_atlas',
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    likes: 212,
    retweets: 31,
    folderIds: ['f-agents'],
  },
  {
    id: '202',
    text: 'We cut our support queue in half with a docs-first agent that cites the exact paragraph it used. Citations are the feature.',
    username: 'sample_ledger',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    likes: 188,
    retweets: 24,
    folderIds: ['f-agents'],
  },
  {
    id: '203',
    text: 'Local-first note apps win on trust: your saves never leave the device until you say so. Sync is a feature, not a default.',
    username: 'sample_mira',
    createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
    likes: 96,
    retweets: 11,
    folderIds: ['f-craft'],
  },
  {
    id: '204',
    text: 'A weekly review of your own bookmarks beats any algorithmic feed. You already curated it — just re-read with intent.',
    username: 'sample_kepler',
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    likes: 143,
    retweets: 19,
    folderIds: ['f-craft'],
  },
  {
    id: '205',
    text: 'Thread drafts that quote their sources get 3x the replies of hot takes. Receipts are engagement.',
    username: 'sample_juno',
    createdAt: new Date(Date.now() - 6 * 86400000).toISOString(),
    likes: 167,
    retweets: 22,
    folderIds: ['f-agents', 'f-craft'],
  },
  {
    id: '206',
    text: 'Ship the boring version first. The agent that files expense reports reliably beats the demo that writes poetry.',
    username: 'sample_atlas',
    createdAt: new Date(Date.now() - 8 * 86400000).toISOString(),
    likes: 121,
    retweets: 14,
    folderIds: ['f-agents'],
  },
]

export const FIXTURE_DIGEST: WeeklyDigest = {
  text: `## This week in your saves
You saved 6 posts circling two themes: constrained agent loops that cite their work, and trust-first personal tooling. The throughline is human-gated automation — small loops, visible receipts, local-first defaults.

## Themes
1. Agents that show their work — saves [201], [202]
2. Curation as a practice — saves [204], [205]
3. Boring reliability over demos — saves [206], [203]

## Worth forging
- A thread on citation-first agents (via [@sample_ledger])`,
  createdAt: new Date(Date.now() - 86400000).toISOString(),
  postCount: 6,
  model: 'fixture',
}
