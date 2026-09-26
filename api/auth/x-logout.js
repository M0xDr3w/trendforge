// POST /api/auth/x-logout — destroy the server session + clear the cookie.

import { kv } from '@vercel/kv'
import { clearSessionCookie, getSessionId, sessionKey } from '../_lib/session.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' })
  }
  const sid = getSessionId(req)
  if (sid) {
    await kv.del(sessionKey(sid)).catch(() => {})
  }
  clearSessionCookie(req, res)
  return res.json({ ok: true })
}
