import type { Cluster, XPost } from './types'

export interface ThemeFrequency {
  name: string
  volume: number
  pct: number
}

export interface SentimentBucket {
  label: string
  range: string
  count: number
  pct: number
}

export interface RisingCluster {
  name: string
  shift: number
  volume: number
  avgSentiment: number
  momentum: 'hot' | 'warm' | 'cooling'
}

const SENTIMENT_RANGES: { label: string; range: string; min: number; max: number }[] = [
  { label: 'Very neg', range: '< -0.5', min: -Infinity, max: -0.5 },
  { label: 'Negative', range: '-0.5 – 0', min: -0.5, max: -0.15 },
  { label: 'Neutral', range: '±0.15', min: -0.15, max: 0.15 },
  { label: 'Positive', range: '0 – 0.5', min: 0.15, max: 0.5 },
  { label: 'Very pos', range: '> 0.5', min: 0.5, max: Infinity },
]

export function computeThemeFrequency(clusters: Cluster[]): ThemeFrequency[] {
  const total = clusters.reduce((sum, c) => sum + c.volume, 0) || 1
  return clusters
    .map(c => ({
      name: c.name,
      volume: c.volume,
      pct: Number(((c.volume / total) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.volume - a.volume)
}

function inSentimentRange(value: number, min: number, max: number): boolean {
  if (min === -Infinity) return value < max
  if (max === Infinity) return value >= min
  return value >= min && value <= max
}

export function computeSentimentHistogram(posts: XPost[]): SentimentBucket[] {
  const total = posts.length || 1
  return SENTIMENT_RANGES.map(({ label, range, min, max }) => {
    const count = posts.filter(p => inSentimentRange(p.sentiment, min, max)).length
    return {
      label,
      range,
      count,
      pct: Number(((count / total) * 100).toFixed(1)),
    }
  })
}

export function getRisingClusters(clusters: Cluster[], limit = 5): RisingCluster[] {
  return clusters
    .map(c => ({
      name: c.name,
      shift: c.shift,
      volume: c.volume,
      avgSentiment: c.avgSentiment,
      momentum: c.shift > 0.4 ? 'hot' as const : c.shift > 0.15 ? 'warm' as const : 'cooling' as const,
    }))
    .filter(c => c.shift > 0.1 || c.volume >= 3)
    .sort((a, b) => b.shift - a.shift || b.volume - a.volume)
    .slice(0, limit)
}

export function computeFeedStats(posts: XPost[], clusters: Cluster[]) {
  const sentiments = posts.map(p => p.sentiment)
  const avgSentiment =
    sentiments.length > 0 ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length : 0
  const positivePct =
    posts.length > 0
      ? (posts.filter(p => p.sentiment > 0.15).length / posts.length) * 100
      : 0
  const hotClusters = clusters.filter(c => c.shift > 0.3).length

  return {
    postCount: posts.length,
    clusterCount: clusters.length,
    avgSentiment: Number(avgSentiment.toFixed(2)),
    positivePct: Number(positivePct.toFixed(0)),
    hotClusters,
  }
}