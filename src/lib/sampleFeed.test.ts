import { describe, expect, it } from 'vitest'
import { generateMockPost, SAMPLE_USERNAMES, seedPosts } from './feed'

// Real handles that must never appear in sample data with invented counts.
const REAL_HANDLES = ['techcrunch', 'a16z', 'levelsio', 'swyx', 'indiehackers']

describe('sample feed honesty', () => {
  it('labels every seed post as sample data', () => {
    const posts = seedPosts()
    expect(posts.length).toBeGreaterThan(0)
    for (const post of posts) {
      expect(post.sample).toBe(true)
    }
  })

  it('uses only obviously fictional @sample_* accounts', () => {
    const posts = seedPosts()
    for (const post of posts) {
      expect(post.username.startsWith('sample_')).toBe(true)
      expect(REAL_HANDLES).not.toContain(post.username.toLowerCase())
    }
    for (const name of SAMPLE_USERNAMES) {
      expect(name.startsWith('sample_')).toBe(true)
      expect(REAL_HANDLES).not.toContain(name)
    }
  })

  it('generates mock posts with fictional accounts and the sample flag', () => {
    for (let i = 0; i < 25; i++) {
      const post = generateMockPost(9000 + i)
      expect(post.sample).toBe(true)
      expect(SAMPLE_USERNAMES).toContain(post.username)
      expect(REAL_HANDLES).not.toContain(post.username.toLowerCase())
    }
  })

  it('keeps invented counts modest (no fake viral metrics)', () => {
    for (let i = 0; i < 25; i++) {
      const post = generateMockPost(9100 + i)
      expect(post.likes).toBeLessThan(5000)
      expect(post.retweets).toBeLessThan(1000)
    }
  })
})
