import { describe, expect, it } from 'vitest'
import type { XPost } from './types'
import { clusterPostsSemantically, tokenize } from './semantic'

function makePost(text: string, id = 1): XPost {
  return {
    id,
    text,
    username: 'user',
    timestamp: new Date().toISOString(),
    likes: 0,
    retweets: 0,
    sentiment: 0,
  }
}

describe('tokenize', () => {
  it('strips urls, mentions, and stop words', () => {
    const tokens = tokenize('Check https://x.com/foo @someone the agents shipping fast')
    expect(tokens).toContain('agents')
    expect(tokens).toContain('shipping')
    expect(tokens).toContain('fast')
    expect(tokens).not.toContain('the')
    expect(tokens.some(t => t.includes('http'))).toBe(false)
  })
})

describe('clusterPostsSemantically', () => {
  it('groups similar posts and labels by top terms', () => {
    const posts = [
      makePost('local embeddings vector search rag pipeline', 1),
      makePost('vector embeddings for local rag search', 2),
      makePost('completely unrelated sports weather forecast', 3),
    ]
    const groups = clusterPostsSemantically(posts, 0.15)
    expect(groups.length).toBeGreaterThanOrEqual(2)
    const embeddingGroup = groups.find(g => g.topTerms.some(t => t.includes('embedding') || t.includes('vector')))
    expect(embeddingGroup?.posts.length).toBeGreaterThanOrEqual(2)
  })

  it('returns a single group for one post', () => {
    const groups = clusterPostsSemantically([makePost('solo signal about agents')])
    expect(groups).toHaveLength(1)
    expect(groups[0].posts).toHaveLength(1)
  })
})
