// Optional owner lockdown token for the Vercel proxies.
//
// When APP_ACCESS_TOKEN is set server-side, the browser must echo the same
// value via the `x-app-token` header. The token lives in sessionStorage only
// (cleared when the tab closes) and is never committed.

export const APP_TOKEN_STORAGE_KEY = 'trendforge-app-token'

export function loadAppToken(): string {
  try {
    return sessionStorage.getItem(APP_TOKEN_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function saveAppToken(token: string): void {
  try {
    if (token.trim()) {
      sessionStorage.setItem(APP_TOKEN_STORAGE_KEY, token.trim())
    } else {
      sessionStorage.removeItem(APP_TOKEN_STORAGE_KEY)
    }
  } catch {
    // Storage unavailable — the request simply goes out without the header.
  }
}

export function appTokenHeaders(): Record<string, string> {
  const token = loadAppToken().trim()
  return token ? { 'x-app-token': token } : {}
}
