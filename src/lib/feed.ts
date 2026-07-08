import type { XPost } from './types'
import { config } from './config'
import {
  normalizeProxyError,
  showXApiErrorToast,
  type FetchRealPostsResult,
} from './xApiErrors'

export type { FetchRealPostsResult } from './xApiErrors'

export const SEED_POSTS: Omit<XPost, 'id' | 'timestamp'>[] = [
  { text: 'AI agents are finally shipping real products this week. The loop is closing fast.', username: 'a16z', likes: 12400, retweets: 2100, sentiment: 0.8 },
  { text: 'The new xAI Grok updates are actually impressive for coding assistance.', username: 'levelsio', likes: 8900, retweets: 1400, sentiment: 0.7 },
  { text: 'Everyone is talking about local embeddings but no one is shipping the UX yet.', username: 'swyx', likes: 5600, retweets: 980, sentiment: 0.3 },
  { text: 'Sentiment on consumer AI apps turning negative after the latest wave of layoffs.', username: 'techcrunch', likes: 3200, retweets: 650, sentiment: -0.6 },
  { text: 'Real-time trend engines + MCP servers might be the killer combo for 2026.', username: 'levelsio', likes: 4100, retweets: 720, sentiment: 0.9 },
]

export function generateMockPost(id: number): XPost {
  const templates = [
    'The {topic} space is moving incredibly fast right now. New players every day.',
    'Hot take: {topic} is about to get a massive correction in the next 30 days.',
    'Just shipped a small experiment with {topic}. The results are surprising.',
    'Everyone is sleeping on how {topic} changes the game for independent creators.',
    'Real signal: volume on {topic} discussions up 3x since last week.',
  ]
  const topics = ['AI agents', 'local models', 'real-time search', 'narrative tools', 'X content']
  const topic = topics[Math.floor(Math.random() * topics.length)]
  const text = templates[Math.floor(Math.random() * templates.length)].replace('{topic}', topic)

  return {
    id,
    text,
    username: ['swyx', 'levelsio', 'a16z', 'techcrunch', 'indiehackers'][Math.floor(Math.random() * 5)],
    timestamp: new Date(Date.now() - Math.random() * 1000 * 60 * 30).toISOString(),
    likes: Math.floor(Math.random() * 12000) + 800,
    retweets: Math.floor(Math.random() * 1800) + 120,
    sentiment: (Math.random() - 0.5) * 1.8,
  }
}

export function seedPosts(): XPost[] {
  return SEED_POSTS.map((p, i) => ({
    ...p,
    id: 1000 + i,
    timestamp: new Date(Date.now() - i * 100000).toISOString(),
  }))
}

export async function fetchRealPosts(
  query: string,
  options?: { silent?: boolean },
): Promise<FetchRealPostsResult> {
  let proxyResult: FetchRealPostsResult | null = null

  try {
    const res = await fetch(`/api/x-search?query=${encodeURIComponent(query)}&max_results=20`)
    const data: unknown = await res.json().catch(() => ({}))

    if (res.ok && Array.isArray(data)) {
      return { posts: data as XPost[] }
    }

    proxyResult = { posts: [], error: normalizeProxyError(data as Record<string, unknown>, res.status) }
  } catch (e) {
    console.warn('Proxy fetch error', e)
    proxyResult = { posts: [], error: normalizeProxyError({ code: 'network_error' }) }
  }

  if (proxyResult?.error && proxyResult.error.code !== 'network_error') {
    if (!options?.silent) showXApiErrorToast(proxyResult.error)
    return proxyResult
  }

  const allowClientBearer = config.allowClientBearer && import.meta.env.DEV
  if (!allowClientBearer) {
    if (proxyResult?.error && !options?.silent) showXApiErrorToast(proxyResult.error)
    return proxyResult ?? { posts: [], error: normalizeProxyError({ code: 'network_error' }) }
  }

  let bearer = localStorage.getItem('x_bearer') || ''
  if (!bearer) {
    const input = prompt(
      'Enter X Bearer token (dev only — prefer `X_BEARER_TOKEN=... npx vercel dev`).\n\nGet from: developer.x.com',
    )
    if (!input) return proxyResult ?? { posts: [] }
    localStorage.setItem('x_bearer', input)
    bearer = input
  }

  try {
    const url = `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=20&tweet.fields=public_metrics,created_at,author_id&expansions=author_id&user.fields=username`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } })
    const bodyText = await res.text()
    let data: { data?: unknown[]; includes?: { users?: { id?: string; username?: string }[] } } = {}
    try {
      data = JSON.parse(bodyText)
    } catch {
      /* ignore */
    }

    if (!res.ok) {
      let parsed: Record<string, unknown> = {}
      try {
        parsed = JSON.parse(bodyText)
      } catch {
        parsed = { detail: bodyText.slice(0, 120) }
      }
      const error = normalizeProxyError(parsed, res.status)
      if (!options?.silent) showXApiErrorToast(error)
      return { posts: [], error }
    }

    const posts = (data.data || []).map((t, i) => {
      const tweet = t as {
        text?: string
        author_id?: string
        created_at?: string
        public_metrics?: { like_count?: number; retweet_count?: number }
      }
      const user = (data.includes?.users || []).find(u => u.id === tweet.author_id) || {}
      return {
        id: Date.now() + i,
        text: tweet.text || '',
        username: user.username || 'xuser',
        timestamp: tweet.created_at || new Date().toISOString(),
        likes: tweet.public_metrics?.like_count || 0,
        retweets: tweet.public_metrics?.retweet_count || 0,
        sentiment: 0.2,
      }
    })
    return { posts }
  } catch {
    const error = normalizeProxyError({ code: 'network_error' })
    if (!options?.silent) showXApiErrorToast(error)
    return { posts: [], error }
  }
}

export function mergePosts(existing: XPost[], incoming: XPost[], maxPosts = config.maxPosts): XPost[] {
  const seen = new Set(existing.map(p => p.text.trim().toLowerCase()))
  const additions = incoming.filter(p => !seen.has(p.text.trim().toLowerCase()))
  if (additions.length === 0) return existing
  return [...additions, ...existing].slice(0, maxPosts)
}
