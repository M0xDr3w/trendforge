import { describe, expect, it } from 'vitest'
import {
  clusterSignature,
  diffThemeLabels,
  discoverThemes,
  distinctiveTerms,
  docFrequencies,
  heuristicName,
  tokenize,
} from './themes.js'

const P = (id, text, createdAt = `2026-09-${id}T00:00:00.000Z`) => ({ id, text, username: 's', createdAt })

describe('tokenize', () => {
  it('drops stopwords, urls, and stubs', () => {
    expect(tokenize('The agents are shipping https://x.com/y real products')).toContain('agent')
    expect(tokenize('the and of a to')).toEqual([])
  })
})

describe('discoverThemes', () => {
  const posts = [
    P('1', 'Small agent loops beat big agent frameworks. Constrain the tools, log every step.'),
    P('2', 'Docs-first support agent cites the exact paragraph it used.'),
    P('3', 'Ship the boring agent first. Filing expense reports beats the poetry demo.'),
    P('4', 'Lisbon miradouros sunset ginjinha Sintra palaces tram twenty-eight.'),
  ]

  it('groups lexically related saves and names the cluster', () => {
    const { themes, leftoverIds } = discoverThemes(posts, { threshold: 0.1 })
    const agents = themes.find(t => t.postIds.includes('1'))
    expect(agents).toBeTruthy()
    expect(agents.postIds).toContain('3')
    expect(agents.sig).toBeTruthy()
    expect(agents.name.length).toBeGreaterThan(0)
    // Lexically unique saves stay ungrouped for the Grok placement pass.
    expect(leftoverIds).toContain('4')
  })

  it('is deterministic for a fixed input order', () => {
    const a = discoverThemes(posts, { threshold: 0.1 })
    const b = discoverThemes(posts, { threshold: 0.1 })
    expect(a).toEqual(b)
  })

  it('handles an empty pile', () => {
    expect(discoverThemes([])).toEqual({ themes: [], leftoverIds: [] })
  })
})

describe('diffThemeLabels', () => {
  it('reuses cached names and surfaces only new signatures', () => {
    const themes = [
      { sig: 'a|b', name: 'Old', postIds: ['1'], topTerms: ['a'] },
      { sig: 'c|d', name: 'New', postIds: ['2'], topTerms: ['c'] },
    ]
    const { labeled, needsLabeling } = diffThemeLabels({ 'a|b': { name: 'Kept Name' } }, themes)
    expect(labeled).toEqual([{ sig: 'a|b', name: 'Kept Name', postIds: ['1'], topTerms: ['a'], cached: true }])
    expect(needsLabeling.map(t => t.sig)).toEqual(['c|d'])
  })

  it('dedupes repeated signatures', () => {
    const t = { sig: 'x', name: 'N', postIds: ['1'], topTerms: [] }
    const { needsLabeling } = diffThemeLabels({}, [t, t])
    expect(needsLabeling).toHaveLength(1)
  })
})

describe('distinctiveTerms / helpers', () => {
  it('prefers rare shared terms over common ones', () => {
    const agg = new Map([['agent', 3], ['thing', 3]])
    const df = new Map([['agent', 2], ['thing', 50]])
    expect(distinctiveTerms(agg, df, 60, 1)).toEqual(['agent'])
    expect(docFrequencies([new Map([['a', 1]]), new Map([['a', 2], ['b', 1]])]).get('a')).toBe(2)
    expect(clusterSignature(['b', 'a'])).toBe('a|b')
    expect(heuristicName(['agent', 'loop'])).toBe('Agent · Loop')
  })
})
