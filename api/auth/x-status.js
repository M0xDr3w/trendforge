// GET /api/auth/x-status — signed-in probe (no tokens leave the server).

import { kv } from '@vercel/kv'
import {
  decryptTokens,
  getSessionId,
  requireSessionSecret,
  sessionKey,
} from '../_lib/session.js'

export default async function handler(req, res) {
  const sid = getSessionId(req)
  if (!sid) return res.json({ signedIn: false })
  const secret = requireSessionSecret()
  if (!secret) return res.json({ signedIn: false })
  try {
    const sealed = await kv.get(sessionKey(sid))
    if (!sealed) return res.json({ signedIn: false })
    const bundle = decryptTokens(secret, sealed)
    return res.json({
      signedIn: true,
      username: bundle.username || null,
      expiresAt: bundle.expiresAt || null,
    })
  } catch {
    return res.json({ signedIn: false })
  }
}
