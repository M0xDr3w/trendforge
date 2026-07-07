import type { XPost, Cluster } from './types'
import { KEYWORD_BUCKETS } from './config'
import { computeVelocity } from './insights'

export function computeClusters(
  posts: XPost[],
  volumeHistory: Record<string, number>[] = [],
): Cluster[] {
  const clusters: Record<string, XPost[]> = {}
  const used = new Set<number>()

  Object.entries(KEYWORD_BUCKETS).forEach(([name, keywords]) => {
    const matching = posts.filter(p => {
      if (used.has(p.id)) return false
      const lower = p.text.toLowerCase()
      return keywords.some(k => lower.includes(k))
    })
    if (matching.length > 0) {
      matching.forEach(p => used.add(p.id))
      clusters[name] = matching
    }
  })

  const remaining = posts.filter(p => !used.has(p.id))
  if (remaining.length > 0) {
    clusters['Other Signals'] = remaining
  }

  return Object.entries(clusters).map(([name, clusterPosts], idx) => {
    const volume = clusterPosts.length
    const avgSentiment =
      clusterPosts.reduce((sum, p) => sum + p.sentiment, 0) / Math.max(1, clusterPosts.length)

    const volHistory = volumeHistory.map(h => h[name] ?? 0)
    const velocity = computeVelocity(volHistory)
    const shift = Number(((velocity - 0.5) * 2.8).toFixed(2))

    return {
      id: `c${idx}`,
      name,
      keywords: KEYWORD_BUCKETS[name] || ['signal'],
      posts: clusterPosts,
      volume,
      avgSentiment,
      shift,
    }
  }).sort((a, b) => b.volume - a.volume)
}

export function buildVolumeSnapshot(posts: XPost[]): Record<string, number> {
  const vols: Record<string, number> = {}
  computeClusters(posts).forEach(c => {
    vols[c.name] = c.volume
  })
  return vols
}
