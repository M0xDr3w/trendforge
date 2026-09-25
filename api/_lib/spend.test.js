import { beforeEach, describe, expect, it } from 'vitest'
import { buildDigestPrompt, chargeSpend, monthKey } from './spend.js'

function memKv() {
  const store = new Map()
  return {
    async get(k) {
      return store.has(k) ? store.get(k) : null
    },
    async incrby(k, n) {
      store.set(k, (store.get(k) || 0) + n)
      return store.get(k)
    },
  }
}

beforeEach(() => {
  delete process.env.X_SPEND_CAP_USD
})

describe('monthKey', () => {
  it('buckets by UTC month', () => {
    expect(monthKey()).toMatch(/^xapi:spend_cents:\d{4}-\d{2}$/)
  })
})

describe('chargeSpend', () => {
  it('charges actuals and blocks over the cap', async () => {
    process.env.X_SPEND_CAP_USD = '0.05'
    const kv = memKv()
    // 30 reads × $0.001 = $0.03 → ok
    await expect(chargeSpend({ kv, reads: 30, costPerPostUsd: 0.001 })).resolves.toMatchObject({
      ok: true,
    })
    // another $0.03 would exceed the $0.05 cap
    const blocked = await chargeSpend({ kv, reads: 30, costPerPostUsd: 0.001 })
    expect(blocked.ok).toBe(false)
    expect(blocked.capUsd).toBe(0.05)
  })

  it('dryRun checks without incrementing', async () => {
    process.env.X_SPEND_CAP_USD = '1'
    const kv = memKv()
    await chargeSpend({ kv, reads: 100, costPerPostUsd: 0.001, dryRun: true })
    expect(await kv.get(monthKey())).toBeNull()
    await chargeSpend({ kv, reads: 100, costPerPostUsd: 0.001 })
    expect(await kv.get(monthKey())).toBe(10)
  })
})

describe('buildDigestPrompt', () => {
  const posts = [
    { id: '1', username: 'sample_a', text: 'agent loops' },
    { id: '2', username: 'sample_b', text: 'sourdough starter' },
  ]
  it('organizes saves under theme headings', () => {
    const prompt = buildDigestPrompt(posts, [
      { name: 'Agents', postIds: ['1'] },
      { name: 'Baking', postIds: ['2'] },
    ])
    expect(prompt).toContain('### Agents (1)')
    expect(prompt).toContain('[1] @sample_a')
    expect(prompt).toContain('### Baking (1)')
  })

  it('lists unthemed saves separately and works without themes', () => {
    const prompt = buildDigestPrompt(posts, [{ name: 'Agents', postIds: ['1'] }])
    expect(prompt).toContain('### More saves (1)')
    expect(buildDigestPrompt(posts)).toContain('[2] @sample_b')
  })
})
