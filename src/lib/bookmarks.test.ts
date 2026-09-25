import { describe, expect, it } from 'vitest'
import {
  buildBookmarkForgePrompt,
  filterByFolder,
  FIXTURE_BOOKMARKS,
  FIXTURE_DIGEST,
  FIXTURE_FOLDERS,
  mergeBookmarks,
  searchBookmarks,
  type BookmarkPost,
} from './bookmarks'

const P = (over: Partial<BookmarkPost>): BookmarkPost => ({
  id: '1',
  text: 'hello agents',
  username: 'sample_atlas',
  createdAt: '2026-09-20T00:00:00.000Z',
  likes: 10,
  retweets: 1,
  ...over,
})

describe('searchBookmarks', () => {
  const posts = [P({ id: '1', text: 'agent loops rock' }), P({ id: '2', username: 'sample_mira', text: 'notes forever' })]
  it('matches text and username, case-insensitive', () => {
    expect(searchBookmarks(posts, 'AGENT')).toHaveLength(1)
    expect(searchBookmarks(posts, 'mira')[0].id).toBe('2')
  })
  it('returns everything on empty query', () => {
    expect(searchBookmarks(posts, '  ')).toHaveLength(2)
  })
})

describe('mergeBookmarks', () => {
  it('dedupes by id and sorts newest first', () => {
    const existing = [P({ id: '1', createdAt: '2026-09-18T00:00:00.000Z' })]
    const incoming = [
      P({ id: '1', createdAt: '2026-09-18T00:00:00.000Z' }),
      P({ id: '2', createdAt: '2026-09-21T00:00:00.000Z' }),
    ]
    const merged = mergeBookmarks(existing, incoming)
    expect(merged.map(p => p.id)).toEqual(['2', '1'])
  })
  it('returns the same array when nothing is new', () => {
    const existing = [P({ id: '1' })]
    expect(mergeBookmarks(existing, [P({ id: '1' })])).toBe(existing)
  })
})

describe('filterByFolder', () => {
  it('filters on folder membership', () => {
    const posts = [P({ id: '1', folderIds: ['f-a'] }), P({ id: '2' })]
    expect(filterByFolder(posts, 'f-a').map(p => p.id)).toEqual(['1'])
    expect(filterByFolder(posts, '')).toHaveLength(2)
  })
})

describe('buildBookmarkForgePrompt', () => {
  it('requires citations and uses strict numbered format', () => {
    const prompt = buildBookmarkForgePrompt(FIXTURE_BOOKMARKS.slice(0, 3))
    expect(prompt).toContain('MUST cite')
    expect(prompt).toContain('@sample_atlas')
    expect(prompt).toContain('(via [@user])')
    expect(prompt).toContain('1. <idea>')
    expect(prompt).toContain('Never invent engagement metrics')
  })
})

describe('fixtures', () => {
  it('uses fictional accounts and cites fixture ids in the digest', () => {
    for (const p of FIXTURE_BOOKMARKS) {
      expect(p.username.startsWith('sample_')).toBe(true)
    }
    expect(FIXTURE_FOLDERS.length).toBeGreaterThan(0)
    expect(FIXTURE_DIGEST.text).toContain('[201]')
    expect(FIXTURE_DIGEST.text).toContain('[@sample_ledger]')
  })
})
