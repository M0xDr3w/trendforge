import { forgeContent } from './narrative'
import { generateSparks } from './insights'
import type { Cluster, Insight, SavedRadar, XPost } from './types'

export interface ExportContext {
  selectedCluster: Cluster | null
  customTopic: string
  posts: XPost[]
  clusters: Cluster[]
  insights: Insight[]
  radars: SavedRadar[]
}

function topicSlug(topic: string): string {
  return topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'signal'
}

export function buildExportPrefix(topic: string): string {
  const date = new Date().toISOString().slice(0, 10)
  return `trendforge-${topicSlug(topic)}-${date}`
}

function resolveTopic(ctx: ExportContext): string {
  return ctx.selectedCluster?.name || ctx.customTopic || 'emerging signal'
}

export function buildThreadMarkdown(ctx: ExportContext): string {
  const topic = resolveTopic(ctx)
  const cluster = ctx.selectedCluster
  const vol = cluster?.volume || ctx.posts.length
  const sent = cluster ? cluster.avgSentiment.toFixed(2) : '0.00'
  const shift = cluster ? cluster.shift.toFixed(2) : '0.00'
  const ideas = forgeContent(cluster, ctx.customTopic || undefined)
  const sparks = cluster
    ? generateSparks({ name: cluster.name, category: cluster.name })
    : []

  return `# ${topic} — TrendForge Thread

**Generated:** ${new Date().toISOString()}
**Cluster volume:** ${vol} | **Avg sentiment:** ${sent} | **Shift:** ${shift}
**Source:** TrendForge real-time X radar

## Key Signals
${cluster?.posts.slice(0, 3).map(p => `- ${p.text} (@${p.username})`).join('\n') || '- Live feed analysis'}

## Forged Angles
${ideas.map((i, idx) => `${idx + 1}. ${i}`).join('\n\n')}

## Sparks / Next Experiments
${sparks.map(s => `- ${s}`).join('\n') || '- Run a 48h micro-experiment'}

## Action
${ctx.insights[0]?.action || 'Ship the contrarian or gap angle now.'}

---
Exported from TrendForge. Pair with ForgeRouter for private LLM refinement.
`
}

export function buildMetaJson(ctx: ExportContext): Record<string, unknown> {
  const topic = resolveTopic(ctx)
  const cluster = ctx.selectedCluster
  const ideas = forgeContent(cluster, ctx.customTopic || undefined)
  const sparks = cluster
    ? generateSparks({ name: cluster.name, category: cluster.name })
    : []

  return {
    topic,
    volume: cluster?.volume || ctx.posts.length,
    sentiment: cluster ? cluster.avgSentiment.toFixed(2) : '0.00',
    shift: cluster ? cluster.shift.toFixed(2) : '0.00',
    forged: ideas,
    sparks,
    timestamp: new Date().toISOString(),
    radars: ctx.radars.map(r => ({
      name: r.name,
      query: r.query,
      lastSynced: r.lastSynced ?? null,
    })),
    clusters: ctx.clusters.map(c => ({
      name: c.name,
      volume: c.volume,
      sentiment: c.avgSentiment,
      shift: c.shift,
      posts: c.posts.length,
    })),
    selectedCluster: cluster?.name ?? null,
  }
}

export function buildSignalsJson(ctx: ExportContext): Record<string, unknown> {
  const topic = resolveTopic(ctx)
  const signals = ctx.selectedCluster?.posts ?? ctx.posts.slice(0, 20)

  return {
    topic,
    timestamp: new Date().toISOString(),
    count: signals.length,
    posts: signals,
  }
}

function triggerDownload(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Defer revocation so the browser can start the download before the URL is freed.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function downloadExportBundle(ctx: ExportContext): Promise<void> {
  const topic = resolveTopic(ctx)
  const prefix = buildExportPrefix(topic)

  triggerDownload(`${prefix}-thread.md`, buildThreadMarkdown(ctx), 'text/markdown')
  await delay(250)
  triggerDownload(`${prefix}-meta.json`, JSON.stringify(buildMetaJson(ctx), null, 2), 'application/json')
  await delay(250)
  triggerDownload(`${prefix}-signals.json`, JSON.stringify(buildSignalsJson(ctx), null, 2), 'application/json')
}

export function downloadMarkdownThread(ctx: ExportContext): void {
  const topic = resolveTopic(ctx)
  const prefix = buildExportPrefix(topic)
  triggerDownload(`${prefix}-thread.md`, buildThreadMarkdown(ctx), 'text/markdown')
  triggerDownload(`${prefix}-meta.json`, JSON.stringify(buildMetaJson(ctx), null, 2), 'application/json')
}
