import type { Cluster, Insight } from './types'
import { forgeContent as templateForgeContent } from './narrative'

export const FORGE_URL_STORAGE_KEY = 'trendforge-forge-url'

export type ForgeMode = 'templates' | 'llm'

export function loadForgeUrl(): string {
  try {
    return localStorage.getItem(FORGE_URL_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function saveForgeUrl(url: string): void {
  try {
    if (url.trim()) {
      localStorage.setItem(FORGE_URL_STORAGE_KEY, url.trim())
    } else {
      localStorage.removeItem(FORGE_URL_STORAGE_KEY)
    }
  } catch {}
}

export { templateForgeContent as forgeContent }

export function buildForgePrompt(
  cluster: Cluster | null,
  sparks: string[],
  insights: Insight[],
  customTopic?: string,
): string {
  const topic = customTopic || cluster?.name || 'emerging trend'
  const samplePosts =
    cluster?.posts.slice(0, 5).map(p => `- @${p.username}: ${p.text}`).join('\n') ||
    '- No cluster selected; use global feed context'

  return `You are a sharp content strategist for X/Twitter. Generate 5 unique, timely content angles for the topic "${topic}".

Cluster stats:
- Volume: ${cluster?.volume ?? 'n/a'}
- Avg sentiment: ${cluster?.avgSentiment.toFixed(2) ?? 'n/a'}
- Shift velocity: ${cluster?.shift.toFixed(2) ?? 'n/a'}

Sample posts:
${samplePosts}

${sparks.length > 0 ? `Sparks:\n${sparks.map(s => `- ${s}`).join('\n')}\n` : ''}${insights.length > 0 ? `Insights:\n${insights.slice(0, 3).map(i => `- ${i.title}: ${i.action}`).join('\n')}\n` : ''}
Return exactly 5 numbered angles (1. ... 2. ...) — hooks, thread starters, or newsletter ledes. Be specific, contrarian where useful, no generic filler.`
}

export function parseForgeResponse(text: string): string[] {
  const numbered = [...text.matchAll(/^\s*\d+[.)]\s*(.+)$/gm)].map(m => m[1].trim()).filter(Boolean)
  if (numbered.length >= 2) return numbered.slice(0, 6)

  const lines = text
    .split('\n')
    .map(l => l.replace(/^[-*•]\s*/, '').trim())
    .filter(l => l.length > 20)

  if (lines.length >= 2) return lines.slice(0, 6)
  return templateForgeContent(null, undefined)
}

export async function callForgeLlm(baseUrl: string, prompt: string): Promise<string> {
  const url = baseUrl.replace(/\/$/, '') + '/v1/chat/completions'
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'default',
      messages: [
        { role: 'system', content: 'You write concise, high-signal social content angles.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 800,
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(errText || `ForgeRouter returned ${res.status}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('Empty response from ForgeRouter')
  return content
}
