import { describe, expect, it } from 'vitest'
import {
  buildForgePrompt,
  defaultsForProvider,
  ForgeLlmError,
  ForgeParseError,
  formatForgeLlmError,
  GROK_DEFAULT_MODEL,
  GROK_PROXY_PATH,
  parseForgeResponse,
  resolveChatCompletionsUrl,
} from './forge'
import type { Cluster, Insight } from './types'

const sampleCluster: Cluster = {
  id: 'c1',
  name: 'AI Agents',
  keywords: ['agent', 'agents'],
  volume: 12,
  avgSentiment: 0.4,
  shift: 0.55,
  posts: [
    {
      id: 1,
      text: 'Agents are shipping real products this week',
      username: 'swyx',
      timestamp: new Date().toISOString(),
      likes: 100,
      retweets: 10,
      sentiment: 0.5,
    },
  ],
}

describe('buildForgePrompt', () => {
  it('includes topic, stats, and strict numbered format', () => {
    const insights: Insight[] = [
      { type: 'gap', title: 'Missing demos', detail: 'Few demos', action: 'Ship a demo', cluster: 'AI Agents' },
    ]
    const prompt = buildForgePrompt(sampleCluster, ['Prototype a narrow agent'], insights)
    expect(prompt).toContain('AI Agents')
    expect(prompt).toContain('Volume: 12')
    expect(prompt).toContain('rising')
    expect(prompt).toContain('1. <angle>')
    expect(prompt).toContain('@swyx')
  })

  it('uses custom topic override', () => {
    const prompt = buildForgePrompt(sampleCluster, [], [], 'Local models')
    expect(prompt).toContain('"Local models"')
  })
})

describe('parseForgeResponse', () => {
  it('parses numbered angles', () => {
    const text = `1. Hook about agents
2. Thread on shipping
3. Contrarian take`
    expect(parseForgeResponse(text)).toEqual([
      'Hook about agents',
      'Thread on shipping',
      'Contrarian take',
    ])
  })

  it('throws ForgeParseError when unstructured', () => {
    expect(() => parseForgeResponse('ok')).toThrow(ForgeParseError)
  })
})

describe('resolveChatCompletionsUrl', () => {
  it('appends /v1/chat/completions to a bare host', () => {
    expect(resolveChatCompletionsUrl('http://127.0.0.1:11434')).toBe(
      'http://127.0.0.1:11434/v1/chat/completions',
    )
  })

  it('does not double /v1 when the base already ends with /v1', () => {
    expect(resolveChatCompletionsUrl('http://127.0.0.1:1234/v1')).toBe(
      'http://127.0.0.1:1234/v1/chat/completions',
    )
    expect(resolveChatCompletionsUrl('http://127.0.0.1:1234/v1/')).toBe(
      'http://127.0.0.1:1234/v1/chat/completions',
    )
  })

  it('passes through same-origin Grok proxy path', () => {
    expect(resolveChatCompletionsUrl(GROK_PROXY_PATH)).toBe(GROK_PROXY_PATH)
    expect(resolveChatCompletionsUrl('/api/forge-chat')).toBe('/api/forge-chat')
  })

  it('throws on empty or invalid URLs', () => {
    expect(() => resolveChatCompletionsUrl('')).toThrow(ForgeLlmError)
    expect(() => resolveChatCompletionsUrl('not-a-url')).toThrow(ForgeLlmError)
  })
})

describe('defaultsForProvider', () => {
  it('uses Grok proxy + grok-4.5 for grok provider', () => {
    expect(defaultsForProvider('grok')).toEqual({
      url: GROK_PROXY_PATH,
      model: GROK_DEFAULT_MODEL,
    })
  })
})

describe('formatForgeLlmError', () => {
  it('surfaces typed ForgeLlmError title and hint', () => {
    const err = new ForgeLlmError('timeout', 'Timed out', 'Is ForgeRouter running?')
    expect(formatForgeLlmError(err)).toEqual({
      title: 'Timed out',
      description: 'Is ForgeRouter running?',
    })
  })

  it('surfaces cancelled separately from timeout', () => {
    const err = new ForgeLlmError('cancelled', 'LLM forge cancelled', 'aborted')
    expect(formatForgeLlmError(err).title).toBe('LLM forge cancelled')
  })

  it('falls back for unknown errors', () => {
    expect(formatForgeLlmError('boom')).toEqual({
      title: 'LLM forge failed — using templates',
      description: 'Unknown error',
    })
  })
})
