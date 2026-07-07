import type { Cluster, Insight } from './types'

export function detectInsights(
  currentClusters: Cluster[],
  previousVolumes: Record<string, number>,
): Insight[] {
  const insights: Insight[] = []

  currentClusters.forEach(cluster => {
    const prev = previousVolumes[cluster.name] ?? cluster.volume
    const delta = cluster.volume - prev

    if (Math.abs(delta) > 1) {
      insights.push({
        type: 'shift',
        title: `${cluster.name} ${delta > 0 ? 'spiking' : 'cooling'}`,
        detail: `Volume changed by ${delta > 0 ? '+' : ''}${delta} posts.`,
        cluster: cluster.name,
        action: delta > 0 ? 'Publish explainer or contrarian take now' : 'Pivot to emerging sub-topic',
      })
    }

    if (cluster.avgSentiment < -0.3 && cluster.volume > 2) {
      insights.push({
        type: 'gap',
        title: `Controversy Gap in ${cluster.name}`,
        detail: 'Negative sentiment rising. Opportunity for balanced or solution angle.',
        cluster: cluster.name,
        action: 'Write the "Real problems with..." piece',
      })
    }

    if (cluster.shift > 0.4) {
      insights.push({
        type: 'opportunity',
        title: `Momentum in ${cluster.name}`,
        detail: `Velocity signal ${cluster.shift > 0 ? '+' : ''}${cluster.shift.toFixed(1)} — conversation accelerating.`,
        cluster: cluster.name,
        action: 'Ship a timely thread while volume is rising',
      })
    }
  })

  if (insights.length < 2) {
    insights.push({
      type: 'opportunity',
      title: 'Originality Opportunity',
      detail: 'Low-competition angle on local-first tools still underexplored.',
      action: 'Write the definitive guide while volume is emerging',
    })
  }

  return insights.slice(0, 4)
}

export function forgeContent(cluster: Cluster | null, customTopic?: string): string[] {
  const topic = customTopic || cluster?.name || 'emerging trend'
  const base = topic.toLowerCase()
  const vol = cluster?.volume || 3
  const sent = cluster?.avgSentiment ?? 0.2

  const ideas = [
    `Hook: Everyone is wrong about ${base} — here's the angle no one is writing.`,
    `Thread starter: 1/ The ${base} narrative just flipped. Here's what changed...`,
    `LinkedIn: Why ${base} creates opportunity for independents (big media is behind).`,
    `Newsletter lede: The quiet shift in ${base} most creators are still missing.`,
    `Contrarian: ${base} isn't exploding — it's maturing. Here's how to play the next phase.`,
  ]

  if (sent < -0.2) {
    ideas.push(`Balanced take: The backlash against ${base} is overdone. Here's the durable signal.`)
  }
  if (vol > 4) {
    ideas.push(`Deep dive: 5 under-the-radar projects in ${base} actually shipping (with receipts).`)
  }
  return ideas.slice(0, 6)
}
