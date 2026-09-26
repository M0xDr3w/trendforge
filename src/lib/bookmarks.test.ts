import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildBookmarkForgePrompt,
  fetchBookmarks,
  filterByFolder,
  FIXTURE_BOOKMARKS,
  FIXTURE_DIGEST,
  FIXTURE_FOLDERS,
  FIXTURE_THEMES,
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

describe('fetchBookmarks', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requests up to 300 saves to match the merge cap', async () => {
    let url = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (u: string) => {
        url = u
        return { ok: true, json: async () => ({ posts: [], total: 0, folders: [], assisted: false }) } as Response
      }),
    )
    await fetchBookmarks({ limit: 300 })
    expect(url).toContain('limit=300')
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

  it('covers every fixture save with a named theme', () => {
    const covered = new Set(FIXTURE_THEMES.flatMap(t => t.postIds))
    for (const p of FIXTURE_BOOKMARKS) {
      expect(covered.has(p.id)).toBe(true)
    }
    for (const t of FIXTURE_THEMES) {
      expect(t.name.length).toBeGreaterThan(0)
      expect(t.count).toBe(t.postIds.length)
    }
  })
})

describe('buildBookmarkForgePrompt with themes', () => {
  it('groups sources under theme headings', () => {
    const prompt = buildBookmarkForgePrompt(FIXTURE_BOOKMARKS, undefined, FIXTURE_THEMES)
    expect(prompt).toContain('Theme: Agent loops')
    expect(prompt).toContain('Theme: Curation & craft')
    expect(prompt).toContain('MUST cite')
  })

  it('works without themes', () => {
    const prompt = buildBookmarkForgePrompt(FIXTURE_BOOKMARKS.slice(0, 2))
    expect(prompt).not.toContain('Theme:')
    expect(prompt).toContain('@sample_atlas')
  })
})
