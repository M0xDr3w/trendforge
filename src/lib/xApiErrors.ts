import { toast } from 'sonner'

export type XApiErrorCode =
  | 'token_missing'
  | 'credits_depleted'
  | 'invalid_max_results'
  | 'rate_limit'
  | 'unauthorized'
  | 'forbidden'
  | 'invalid_request'
  | 'proxy_error'
  | 'network_error'

export interface XApiError {
  code: XApiErrorCode
  message: string
  hint: string
}

export interface FetchRealPostsResult {
  posts: import('./types').XPost[]
  error?: XApiError
}

interface ProxyPayload {
  error?: string
  code?: string
  hint?: string
  details?: string
  detail?: string
  status?: number
  title?: string
  [key: string]: unknown
}

const ERROR_MAP: Record<XApiErrorCode, { message: string; hint: string }> = {
  token_missing: {
    message: 'X API token not configured',
    hint: 'Set X_BEARER_TOKEN in Vercel (Production + Preview), then redeploy. Local: X_BEARER_TOKEN=... npx vercel dev',
  },
  credits_depleted: {
    message: 'X API credits depleted',
    hint: 'Restore credits or upgrade your plan at developer.x.com → Billing. Recent Search requires a paid tier.',
  },
  invalid_max_results: {
    message: 'Invalid search request',
    hint: 'max_results must be between 10 and 100 per X API limits.',
  },
  rate_limit: {
    message: 'X API rate limit reached',
    hint: 'Wait a minute and retry. LIVE REAL polls every ~45s to stay conservative.',
  },
  unauthorized: {
    message: 'X API unauthorized',
    hint: 'Regenerate your Bearer Token at developer.x.com → Keys and tokens, update Vercel env, redeploy.',
  },
  forbidden: {
    message: 'X API access forbidden',
    hint: 'Your app may lack Recent Search permission or the correct API tier. Check developer.x.com app access.',
  },
  invalid_request: {
    message: 'Invalid X API request',
    hint: 'Try a simpler search query or check X API status.',
  },
  proxy_error: {
    message: 'X proxy error',
    hint: 'Check Vercel function logs and X_BEARER_TOKEN configuration.',
  },
  network_error: {
    message: 'Could not reach X proxy',
    hint: 'Check your connection. For local dev use npx vercel dev (not plain npm run dev).',
  },
}

function isXApiErrorCode(value: string): value is XApiErrorCode {
  return value in ERROR_MAP
}

function inferCodeFromPayload(payload: ProxyPayload, httpStatus: number): XApiErrorCode {
  if (payload.code && isXApiErrorCode(payload.code)) return payload.code

  const nested = parseNestedDetails(payload.details)
  const detail = String(nested.detail || payload.detail || payload.error || '').toLowerCase()
  const status = nested.status || payload.status || httpStatus

  if (detail.includes('x_bearer_token') || detail.includes('not configured')) return 'token_missing'
  if (detail.includes('credits depleted') || status === 402) return 'credits_depleted'
  if (detail.includes('max_results') || detail.includes('invalid')) return 'invalid_max_results'
  if (status === 429) return 'rate_limit'
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 400) return 'invalid_request'
  return 'proxy_error'
}

function parseNestedDetails(details?: string): ProxyPayload {
  if (!details) return {}
  try {
    return JSON.parse(details) as ProxyPayload
  } catch {
    return { detail: details }
  }
}

export function normalizeProxyError(payload: ProxyPayload | Record<string, unknown>, httpStatus = 500): XApiError {
  const p = payload as ProxyPayload
  const code = inferCodeFromPayload(p, httpStatus)
  const mapped = ERROR_MAP[code]
  return {
    code,
    message: p.error && p.error !== 'X API error' ? p.error : mapped.message,
    hint: (typeof p.hint === 'string' ? p.hint : undefined) || mapped.hint,
  }
}

export function showXApiErrorToast(error: XApiError): void {
  toast.error(error.message, { description: error.hint, duration: 6000 })
}

export type XApiConnectionStatus = 'connected' | 'mock' | 'error'

export function xApiStatusLabel(status: XApiConnectionStatus): string {
  if (status === 'connected') return 'X CONNECTED'
  if (status === 'error') return 'X ERROR'
  return 'MOCK'
}
