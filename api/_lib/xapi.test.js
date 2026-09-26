import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bookmarkCostPerPost,
  fetchAllBookmarks,
  fetchBookmarkFolders,
  mapBookmarkTweet,
} from './xapi.js'

const realFetch = globalThis.fetch

function page(ids, nextToken) {
  return {
    data: ids.map(id => ({
      id,
      text: `post ${id}`,
      author_id: 'u1',
      created_at: '2026-09-20T00:00:00.000Z',
      public_metrics: { like_count: 5, retweet_count: 1 },
    })),
    includes: { users: [{ id: 'u1', username: 'sample_atlas' }] },
    meta: { result_count: ids.length, ...(nextToken ? { next_token: nextToken } : {}) },
  }
}

beforeEach(() => {
  delete process.env.X_BOOKMARK_COST_USD
  delete process.env.X_USER_OWNS_APP
})

afterEach(() => {
  globalThis.fetch = realFetch
  vi.restoreAllMocks()
})

describe('mapBookmarkTweet', () => {
  it('maps metrics and author', () => {
    const users = new Map([['u9', { username: 'sample_mira' }]])
    const p = mapBookmarkTweet(
      { id: 7, text: 'hi', author_id: 'u9', created_at: '2026-01-01', public_metrics: { like_count: 3 } },
      users,
    )
    expect(p).toMatchObject({ id: '7', username: 'sample_mira', likes: 3, retweets: 0 })
  })
})

describe('fetchAllBookmarks', () => {
  it('paginates and dedupes against known ids', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page(['1', '2'], 'tok2') })
      .mockResolvedValueOnce({ ok: true, json: async () => page(['2', '3'], null) })
    const { fresh, fetched } = await fetchAllBookmarks({
      accessToken: 'at',
      userId: 'me',
      knownIds: new Set(['1']),
      maxPages: 5,
    })
    expect(fetched).toBe(4)
    expect(fresh.map(p => p.id)).toEqual(['2', '3'])
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('stops at maxPages', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => page(['9'], 'more'),
    })
    await fetchAllBookmarks({ accessToken: 'at', userId: 'me', maxPages: 2 })
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
  })

  it('throws enriched errors on X failures', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) })
    await expect(fetchAllBookmarks({ accessToken: 'at', userId: 'me' })).rejects.toMatchObject({
      status: 429,
    })
  })
})

describe('fetchBookmarkFolders', () => {
  it('maps folder ids and names', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'f1', name: 'Agents' }] }),
    })
    await expect(fetchBookmarkFolders({ accessToken: 'at', userId: 'me' })).resolves.toEqual([
      { id: 'f1', name: 'Agents' },
    ])
  })
})

describe('bookmarkCostPerPost', () => {
  it('defaults to owned-app pricing, override otherwise', () => {
    expect(bookmarkCostPerPost()).toBe(0.001)
    process.env.X_USER_OWNS_APP = 'false'
    expect(bookmarkCostPerPost()).toBe(0.005)
    process.env.X_BOOKMARK_COST_USD = '0.002'
    expect(bookmarkCostPerPost()).toBe(0.002)
  })
})
