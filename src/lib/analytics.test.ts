import { describe, expect, it } from 'vitest'
import type { Cluster, XPost } from './types'
import {
  computeFeedStats,
  computeSentimentHistogram,
  computeThemeFrequency,
  getRisingClusters,
} from './analytics'

function makeCluster(overrides: Partial<Cluster> & Pick<Cluster, 'name'>): Cluster {
  return {
    id: overrides.name.toLowerCase(),
    keywords: [],
    posts: [],
    volume: 0,
    avgSentiment: 0,
    shift: 0,
    ...overrides,
  }
}

function makePost(overrides: Partial<XPost> & Pick<XPost, 'sentiment'>): XPost {
  return {
    id: 1,
    text: 'sample',
    username: 'user',
    timestamp: new Date().toISOString(),
    likes: 0,
    retweets: 0,
    ...overrides,
  }
}

describe('computeThemeFrequency', () => {
  it('returns percentages sorted by volume', () => {
    const clusters = [
      makeCluster({ name: 'A', volume: 3 }),
      makeCluster({ name: 'B', volume: 1 }),
    ]
    const result = computeThemeFrequency(clusters)
    expect(result[0].name).toBe('A')
    expect(result[0].pct).toBe(75)
    expect(result[1].pct).toBe(25)
  })
})

describe('computeSentimentHistogram', () => {
  it('buckets posts by sentiment range', () => {
    const posts = [
      makePost({ sentiment: -0.8 }),
      makePost({ sentiment: 0 }),
      makePost({ sentiment: 0.7 }),
    ]
    const buckets = computeSentimentHistogram(posts)
    expect(buckets.find(b => b.label === 'Very neg')?.count).toBe(1)
    expect(buckets.find(b => b.label === 'Neutral')?.count).toBe(1)
    expect(buckets.find(b => b.label === 'Very pos')?.count).toBe(1)
  })
})

describe('getRisingClusters', () => {
  it('prioritizes higher shift and filters low signal', () => {
    const clusters = [
      makeCluster({ name: 'Hot', volume: 5, shift: 0.5, avgSentiment: 0.2 }),
      makeCluster({ name: 'Quiet', volume: 1, shift: 0.05, avgSentiment: 0 }),
    ]
    const rising = getRisingClusters(clusters)
    expect(rising[0].name).toBe('Hot')
    expect(rising[0].momentum).toBe('hot')
    expect(rising.some(r => r.name === 'Quiet')).toBe(false)
  })
})

describe('computeFeedStats', () => {
  it('summarizes feed and cluster metrics', () => {
    const posts = [makePost({ sentiment: 0.4 }), makePost({ sentiment: -0.2 })]
    const clusters = [makeCluster({ name: 'A', volume: 2, shift: 0.35 })]
    const stats = computeFeedStats(posts, clusters)
    expect(stats.postCount).toBe(2)
    expect(stats.hotClusters).toBe(1)
    expect(stats.positivePct).toBe(50)
  })
})
