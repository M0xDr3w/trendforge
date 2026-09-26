// Minimal X API client for Bookmark Forge (OAuth 2.0 user context).
// Endpoints: /2/users/me, /2/users/:id/bookmarks (max 100/page, paginated),
// /2/users/:id/bookmarks/folders, /2/users/:id/bookmarks/folders/:folder_id.

export const X_API_BASE = 'https://api.x.com/2'
const TOKEN_URL = 'https://api.x.com/2/oauth2/token'
const TWEET_FIELDS = 'public_metrics,created_at,author_id,conversation_id'
const USER_FIELDS = 'username,name'

function basicAuth(clientId, clientSecret) {
  return Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
}

async function postForm({ clientId, clientSecret, params }) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
    },
    body: new URLSearchParams(params).toString(),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(`X token endpoint returned ${res.status}`)
    err.status = res.status
    err.body = body
    throw err
  }
  return body
}

export function exchangeCode({ clientId, clientSecret, code, verifier, redirectUri }) {
  return postForm({
    clientId,
    clientSecret,
    params: {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    },
  })
}

export function refreshAccessToken({ clientId, clientSecret, refreshToken }) {
  return postForm({
    clientId,
    clientSecret,
    params: { grant_type: 'refresh_token', refresh_token: refreshToken },
  })
}

export async function fetchMe(accessToken) {
  const res = await fetch(`${X_API_BASE}/users/me?user.fields=${USER_FIELDS}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(`X users/me returned ${res.status}`)
    err.status = res.status
    err.body = body
    throw err
  }
  return body?.data
}

/**
 * Best-effort OAuth2 token revocation (RFC 7009-style). Used to discard
 * tokens that must never be stored (e.g. sign-in refused by the owner
 * lock). Failures are the caller's to ignore — dropping the token without
 * storing it is the real guarantee.
 */
export async function revokeToken({ clientId, clientSecret, token }) {
  if (!token) return
  const res = await fetch(`${X_API_BASE}/oauth2/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
    },
    body: new URLSearchParams({ token }).toString(),
  })
  if (!res.ok) {
    const err = new Error(`X revoke returned ${res.status}`)
    err.status = res.status
    throw err
  }
}

export function mapBookmarkTweet(tweet, usersById) {
  const user = usersById.get(tweet.author_id) || {}
  return {
    id: String(tweet.id),
    text: tweet.text || '',
    username: user.username || 'xuser',
    createdAt: tweet.created_at || new Date().toISOString(),
    likes: tweet.public_metrics?.like_count || 0,
    retweets: tweet.public_metrics?.retweet_count || 0,
  }
}

function usersById(body) {
  const map = new Map()
  for (const u of body?.includes?.users || []) {
    if (u?.id) map.set(u.id, u)
  }
  return map
}

async function xGet(accessToken, url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(`X API returned ${res.status} for ${url.split('?')[0]}`)
    err.status = res.status
    err.body = body
    throw err
  }
  return body
}

/** One page of bookmarks. Returns { posts, nextToken }. */
export async function fetchBookmarkPage({ accessToken, userId, paginationToken }) {
  const params = new URLSearchParams({
    max_results: '100',
    'tweet.fields': TWEET_FIELDS,
    expansions: 'author_id',
    'user.fields': USER_FIELDS,
  })
  if (paginationToken) params.set('pagination_token', paginationToken)
  const body = await xGet(accessToken, `${X_API_BASE}/users/${userId}/bookmarks?${params}`)
  const users = usersById(body)
  return {
    posts: (body?.data || []).map(t => mapBookmarkTweet(t, users)),
    nextToken: body?.meta?.next_token || null,
    resultCount: body?.meta?.result_count ?? (body?.data || []).length,
  }
}

/** Paginate bookmarks until maxPages or exhaustion. Dedupes against knownIds. */
export async function fetchAllBookmarks({ accessToken, userId, knownIds = new Set(), maxPages = 5 }) {
  const seen = new Set(knownIds)
  const fresh = []
  let token = null
  let fetched = 0
  for (let page = 0; page < maxPages; page++) {
    const { posts, nextToken } = await fetchBookmarkPage({ accessToken, userId, paginationToken: token })
    fetched += posts.length
    for (const p of posts) {
      if (!seen.has(p.id)) {
        seen.add(p.id)
        fresh.push(p)
      }
    }
    token = nextToken
    if (!token) break
  }
  return { fresh, fetched }
}

export async function fetchBookmarkFolders({ accessToken, userId }) {
  const body = await xGet(accessToken, `${X_API_BASE}/users/${userId}/bookmarks/folders`)
  return (body?.data || []).map(f => ({ id: String(f.id), name: f.name || 'Untitled' }))
}

export async function fetchFolderPosts({ accessToken, userId, folderId, maxPages = 5 }) {
  const posts = []
  let token = null
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      max_results: '100',
      'tweet.fields': TWEET_FIELDS,
      expansions: 'author_id',
      'user.fields': USER_FIELDS,
    })
    if (token) params.set('pagination_token', token)
    const body = await xGet(
      accessToken,
      `${X_API_BASE}/users/${userId}/bookmarks/folders/${folderId}?${params}`,
    )
    const users = usersById(body)
    for (const t of body?.data || []) posts.push(mapBookmarkTweet(t, users))
    token = body?.meta?.next_token || null
    if (!token) break
  }
  return posts
}

/**
 * Per-post USD cost for bookmark reads. Owned reads on your own developer app
 * are ~$0.001/resource; assume $0.005/post otherwise. Override explicitly
 * with X_BOOKMARK_COST_USD.
 */
export function bookmarkCostPerPost() {
  const override = Number(process.env.X_BOOKMARK_COST_USD)
  if (Number.isFinite(override) && override >= 0) return override
  return process.env.X_USER_OWNS_APP === 'false' ? 0.005 : 0.001
}
