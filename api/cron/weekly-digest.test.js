import { describe, expect, it } from 'vitest'
import { cronWeekKey, dedupeSessionsByUser, digestWeekKey } from './weekly-digest.js'

describe('cronWeekKey', () => {
  it('anchors Friday to the preceding Monday', () => {
    expect(cronWeekKey(new Date('2026-09-25T12:00:00Z'))).toBe('2026-09-21')
  })
  it('anchors Sunday to the same Monday and keeps Monday stable', () => {
    expect(cronWeekKey(new Date('2026-09-27T23:59:59Z'))).toBe('2026-09-21')
    expect(cronWeekKey(new Date('2026-09-21T00:00:01Z'))).toBe('2026-09-21')
  })
})

describe('dedupeSessionsByUser', () => {
  it('keeps the first session per X user in stable uid order', () => {
    const groups = dedupeSessionsByUser([
      { sid: 's-b2', bundle: { xUserId: 'u-b' } },
      { sid: 's-a1', bundle: { xUserId: 'u-a' } },
      { sid: 's-b1', bundle: { xUserId: 'u-b' } },
    ])
    expect([...groups.keys()]).toEqual(['u-a', 'u-b'])
    expect(groups.get('u-b').sid).toBe('s-b2')
  })
})

describe('digestWeekKey', () => {
  it('namespaces the weekly idempotency marker', () => {
    expect(digestWeekKey('u1', '2026-09-21')).toBe('tf:digest:week:u1:2026-09-21')
  })
})
