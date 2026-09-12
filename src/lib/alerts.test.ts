import { describe, expect, it } from 'vitest'
import type { Cluster } from './types'
import { detectShiftAlerts, findNewShiftAlerts, formatShiftAlertMessage } from './alerts'

function cluster(name: string, shift: number, volume: number): Cluster {
  return {
    id: name,
    name,
    keywords: [],
    posts: [],
    volume,
    avgSentiment: 0.2,
    shift,
  }
}

describe('detectShiftAlerts', () => {
  it('returns clusters above threshold with minimum volume', () => {
    const alerts = detectShiftAlerts(
      [cluster('Hot', 0.5, 4), cluster('Quiet', 0.1, 5), cluster('Small', 0.6, 1)],
      0.4,
    )
    expect(alerts).toHaveLength(1)
    expect(alerts[0].clusterName).toBe('Hot')
  })
})

describe('findNewShiftAlerts', () => {
  it('fires only once per cluster until shift drops below threshold', () => {
    const clusters = [cluster('AI Agents', 0.45, 3)]
    const first = findNewShiftAlerts(clusters, 0.4, {})
    expect(first.alerts).toHaveLength(1)

    const second = findNewShiftAlerts(clusters, 0.4, first.nextNotified)
    expect(second.alerts).toHaveLength(0)
  })
})

describe('formatShiftAlertMessage', () => {
  it('includes cluster name and shift', () => {
    const msg = formatShiftAlertMessage({ clusterName: 'X & Grok', shift: 0.52, volume: 5, avgSentiment: 0.1 })
    expect(msg).toContain('X & Grok')
    expect(msg).toContain('+0.5')
  })
})
