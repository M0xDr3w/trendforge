import { describe, expect, it } from 'vitest'
import { buildMetaJson, buildThreadMarkdown, type ExportContext } from './export'
import type { Cluster, XPost } from './types'

const post: XPost = {
  id: 1,
  text: 'Agents are shipping',
  username: 'swyx',
  timestamp: new Date().toISOString(),
  likes: 10,
  retweets: 1,
  sentiment: 0.4,
}

const cluster: Cluster = {
  id: 'c1',
  name: 'AI Agents',
  keywords: ['agent'],
  volume: 3,
  avgSentiment: 0.4,
  shift: 0.5,
  posts: [post],
}

function baseCtx(over: Partial<ExportContext> = {}): ExportContext {
  return {
    selectedCluster: cluster,
    customTopic: '',
    posts: [post],
    clusters: [cluster],
    insights: [],
    radars: [],
    ...over,
  }
}

describe('export durable forge', () => {
  it('prefers last forge angles over regenerating templates', () => {
    const durable = ['Durable hook A', 'Durable thread B']
    const md = buildThreadMarkdown(
      baseCtx({ forgedAngles: durable, forgeSource: 'llm', forgeProvider: 'grok', forgeModel: 'grok-4.5' }),
    )
    expect(md).toContain('Durable hook A')
    expect(md).toContain('Durable thread B')
    expect(md).toContain('llm')
    expect(md).toContain('grok-4.5')

    const meta = buildMetaJson(
      baseCtx({ forgedAngles: durable, forgeSource: 'llm', forgeProvider: 'grok', forgeModel: 'grok-4.5' }),
    )
    expect(meta.forged).toEqual(durable)
    expect(meta.forgeSource).toBe('llm')
    expect(meta.forgeProvider).toBe('grok')
  })

  it('falls back to template forge when no durable angles', () => {
    const meta = buildMetaJson(baseCtx())
    expect(Array.isArray(meta.forged)).toBe(true)
    expect((meta.forged as string[]).length).toBeGreaterThan(0)
  })
})
