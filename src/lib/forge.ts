import type { Cluster, Insight } from './types'
import { forgeContent as templateForgeContent } from './narrative'

export const FORGE_URL_STORAGE_KEY = 'trendforge-forge-url'
export const FORGE_API_KEY_STORAGE_KEY = 'trendforge-forge-api-key'
export const FORGE_LLM_TIMEOUT_MS = 30_000

export type ForgeMode = 'templates' | 'llm'

export type ForgeLlmErrorCode =
  | 'timeout'
  | 'network'
  | 'http'
  | 'empty'
  | 'parse'
  | 'invalid_url'

export class ForgeLlmError extends Error {
  readonly code: ForgeLlmErrorCode
  readonly hint: string
  readonly status?: number

  constructor(code: ForgeLlmErrorCode, message: string, hint: string, status?: number) {
    super(message)
    this.name = 'ForgeLlmError'
    this.code = code
    this.hint = hint
    this.status = status
  }
}

/** @deprecated Prefer ForgeLlmError with code `parse` */
export class ForgeParseError extends ForgeLlmError {
  constructor(message = 'Could not parse a structured response from the LLM') {
    super(
      'parse',
      message,
      'Ask the model for numbered angles (1. … 5.) or copy the forge prompt and retry.',
    )
    this.name = 'ForgeParseError'
  }
}

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

export function loadForgeApiKey(): string {
  try {
    return localStorage.getItem(FORGE_API_KEY_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function saveForgeApiKey(apiKey: string): void {
  try {
    if (apiKey.trim()) {
      localStorage.setItem(FORGE_API_KEY_STORAGE_KEY, apiKey.trim())
    } else {
      localStorage.removeItem(FORGE_API_KEY_STORAGE_KEY)
    }
  } catch {}
}

/**
 * Accepts either `http://host:port` or `http://host:port/v1` (and trailing slashes).
 * Always returns the full chat completions endpoint URL.
 */
export function resolveChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim()
  if (!trimmed) {
    throw new ForgeLlmError(
      'invalid_url',
      'LLM gateway URL is empty',
      'Paste a base URL such as http://127.0.0.1:11434 (Ollama) or http://127.0.0.1:1234/v1 (LM Studio).',
    )
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new ForgeLlmError(
      'invalid_url',
      'LLM gateway URL is invalid',
      'Use a full URL including http:// or https://',
    )
  }
  // Strip trailing /v1 or /v1/ so we never produce /v1/v1/chat/completions
  let path = parsed.pathname.replace(/\/+$/, '')
  if (path.endsWith('/v1')) {
    path = path.slice(0, -3)
  }
  if (path === '/') path = ''
  parsed.pathname = `${path}/v1/chat/completions`
  parsed.search = ''
  parsed.hash = ''
  return parsed.toString()
}

export { templateForgeContent as forgeContent }

const SYSTEM_PROMPT = `You are a sharp content strategist for X/Twitter and LinkedIn.
Write specific, timely angles — not generic "AI is changing everything" filler.
Prefer concrete hooks, contrarian frames, and shippable thread openers.
Never invent engagement metrics. Stay under ~40 words per angle.`

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

  const shift = cluster?.shift
  const shiftHint =
    shift == null
      ? ''
      : shift > 0.3
        ? 'Volume is rising — lean into urgency and early-mover angles.'
        : shift < -0.3
          ? 'Volume is cooling — lean into post-mortems, lessons, and contrarian takes.'
          : 'Volume is steady — lean into depth, nuance, and underserved gaps.'

  return `Generate exactly 5 unique content angles for "${topic}".

Cluster stats:
- Volume: ${cluster?.volume ?? 'n/a'}
- Avg sentiment: ${cluster?.avgSentiment.toFixed(2) ?? 'n/a'}
- Shift velocity: ${cluster?.shift.toFixed(2) ?? 'n/a'}
${shiftHint ? `- Signal: ${shiftHint}\n` : ''}
Sample posts:
${samplePosts}

${sparks.length > 0 ? `Sparks (optional fuel):\n${sparks.map(s => `- ${s}`).join('\n')}\n` : ''}${insights.length > 0 ? `Insights:\n${insights.slice(0, 3).map(i => `- ${i.title}: ${i.action}`).join('\n')}\n` : ''}
Format (strict):
1. <angle>
2. <angle>
3. <angle>
4. <angle>
5. <angle>

Mix: at least one hook, one thread starter, one contrarian take. No preamble or closing notes.`
}

export function parseForgeResponse(text: string): string[] {
  const numbered = [...text.matchAll(/^\s*\d+[.)]\s*(.+)$/gm)].map(m => m[1].trim()).filter(Boolean)
  if (numbered.length >= 2) return numbered.slice(0, 6)

  const lines = text
    .split('\n')
    .map(l => l.replace(/^[-*•]\s*/, '').trim())
    .filter(l => l.length > 20)

  if (lines.length >= 2) return lines.slice(0, 6)
  throw new ForgeParseError()
}

export function formatForgeLlmError(err: unknown): { title: string; description: string } {
  if (err instanceof ForgeLlmError) {
    return { title: err.message, description: err.hint }
  }
  if (err instanceof Error) {
    return {
      title: 'LLM forge failed — using templates',
      description: err.message,
    }
  }
  return {
    title: 'LLM forge failed — using templates',
    description: 'Unknown error',
  }
}

function mapHttpError(status: number, body: string): ForgeLlmError {
  const snippet = body.replace(/\s+/g, ' ').trim().slice(0, 160)
  if (status === 401 || status === 403) {
    return new ForgeLlmError(
      'http',
      'LLM gateway rejected the request',
      'Add an API key if this is a cloud gateway, or check local auth settings.',
      status,
    )
  }
  if (status === 404) {
    return new ForgeLlmError(
      'http',
      'Chat completions endpoint not found',
      'Expected POST …/v1/chat/completions. Try with or without /v1 on the base URL.',
      status,
    )
  }
  if (status === 429) {
    return new ForgeLlmError(
      'http',
      'LLM gateway rate limited',
      'Wait a moment and retry, or lower concurrent forge requests.',
      status,
    )
  }
  if (status >= 500) {
    return new ForgeLlmError(
      'http',
      'LLM gateway server error',
      snippet || 'Check gateway logs for model/backend failures.',
      status,
    )
  }
  return new ForgeLlmError(
    'http',
    `LLM gateway returned ${status}`,
    snippet || 'Unexpected response from the gateway.',
    status,
  )
}

function extractDeltaContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const choices = (payload as { choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }> })
    .choices
  const choice = choices?.[0]
  return choice?.delta?.content || choice?.message?.content || ''
}

async function readSseStream(
  res: Response,
  onChunk?: (partial: string) => void,
): Promise<string> {
  if (!res.body) {
    throw new ForgeLlmError(
      'empty',
      'Empty stream from ForgeRouter',
      'ForgeRouter returned no body. Try non-streaming or restart the gateway.',
    )
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n')
    buffer = parts.pop() || ''

    for (const line of parts) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') continue
      try {
        const parsed = JSON.parse(data) as unknown
        const delta = extractDeltaContent(parsed)
        if (delta) {
          content += delta
          onChunk?.(content)
        }
      } catch {
        // ignore malformed SSE lines
      }
    }
  }

  return content.trim()
}

export interface CallForgeLlmOptions {
  onChunk?: (partial: string) => void
  /** Prefer SSE streaming; falls back to a non-stream request if the gateway rejects stream. */
  stream?: boolean
  signal?: AbortSignal
  /** Optional Bearer token for cloud OpenAI-compatible gateways (stored locally only). */
  apiKey?: string
}

function buildAuthHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const key = apiKey?.trim()
  if (key) {
    headers.Authorization = `Bearer ${key}`
  }
  return headers
}

export async function callForgeLlm(
  baseUrl: string,
  prompt: string,
  options: CallForgeLlmOptions = {},
): Promise<string> {
  const url = resolveChatCompletionsUrl(baseUrl)
  const preferStream = options.stream !== false
  const authHeaders = buildAuthHeaders(options.apiKey)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FORGE_LLM_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  options.signal?.addEventListener('abort', onAbort)

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ]

  const bodyBase = {
    model: 'default',
    messages,
    temperature: 0.75,
    max_tokens: 900,
  }

  try {
    if (preferStream) {
      try {
        const streamRes = await fetch(url, {
          method: 'POST',
          headers: { ...authHeaders, Accept: 'text/event-stream' },
          signal: controller.signal,
          body: JSON.stringify({ ...bodyBase, stream: true }),
        })

        if (streamRes.ok) {
          const contentType = streamRes.headers.get('content-type') || ''
          if (contentType.includes('text/event-stream') || contentType.includes('text/plain')) {
            const content = await readSseStream(streamRes, options.onChunk)
            if (!content) {
              throw new ForgeLlmError(
                'empty',
                'Empty response from LLM gateway',
                'The model returned no text. Retry or check the model backend.',
              )
            }
            return content
          }
          // Some gateways ignore stream=true and return JSON — handle that.
          const data = (await streamRes.json()) as {
            choices?: Array<{ message?: { content?: string } }>
          }
          const content = data.choices?.[0]?.message?.content?.trim()
          if (!content) {
            throw new ForgeLlmError(
              'empty',
              'Empty response from LLM gateway',
              'The model returned no text. Retry or check the model backend.',
            )
          }
          options.onChunk?.(content)
          return content
        }

        // Fall through to non-stream for 4xx that often mean "stream unsupported"
        if (streamRes.status !== 400 && streamRes.status !== 422) {
          const errText = await streamRes.text().catch(() => '')
          throw mapHttpError(streamRes.status, errText)
        }
      } catch (err) {
        if (err instanceof ForgeLlmError) throw err
        if (err instanceof Error && err.name === 'AbortError') {
          throw new ForgeLlmError(
            'timeout',
            `LLM gateway timed out after ${FORGE_LLM_TIMEOUT_MS / 1000}s`,
            'Is the gateway running? Try a smaller model or raise timeout later.',
          )
        }
        // Network / stream parse issues → try non-stream once
      }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: authHeaders,
      signal: controller.signal,
      body: JSON.stringify({ ...bodyBase, stream: false }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw mapHttpError(res.status, errText)
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = data.choices?.[0]?.message?.content?.trim()
    if (!content) {
      throw new ForgeLlmError(
        'empty',
        'Empty response from LLM gateway',
        'The model returned no text. Retry or check the model backend.',
      )
    }
    options.onChunk?.(content)
    return content
  } catch (err) {
    if (err instanceof ForgeLlmError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ForgeLlmError(
        'timeout',
        `LLM gateway timed out after ${FORGE_LLM_TIMEOUT_MS / 1000}s`,
        'Is the gateway running? Try a smaller model or raise timeout later.',
      )
    }
    throw new ForgeLlmError(
      'network',
      'Could not reach LLM gateway',
      'Confirm the URL and that Ollama / LM Studio / ForgeRouter is listening locally.',
    )
  } finally {
    clearTimeout(timeoutId)
    options.signal?.removeEventListener('abort', onAbort)
  }
}
