// Pure, side-effect free helpers extracted from TrendSight
// Now integrated into TrendForge for sparks + signal helpers.
// Suitable for testing / import. No React or DOM.

export interface TrendSeed {
  id: number
  name: string
  volume: number
  color?: string
  category?: string
}

export interface Trend extends TrendSeed {
  pulse: number
  history: number[]
  velocity: number
}

export function generateSparks(trend: Partial<TrendSeed> & { name?: string; category?: string }): string[] {
  const tokens = (trend.name || '').toLowerCase().split(/\W+/).concat((trend.category || '').toLowerCase().split(/\W+/))
  const has = (s: string) => tokens.some(t => t.includes(s))

  const ideas: string[] = []

  if (has('ai') || has('agent')) {
    ideas.push('Prototype a narrow agent that automates one repetitive step in your current workflow.')
  }
  if (has('space') || has('climate')) {
    ideas.push('Map one physical constraint in your domain to an analogous orbital or atmospheric limit.')
  }
  if (has('maker') || has('field') || has('ops')) {
    ideas.push('Log the next 3 "tiny wins" with precise tags and measure the delta in 7 days.')
  }
  if (has('real') || has('estate') || has('business')) {
    ideas.push('Identify one public data set or signal that would have predicted the last shift in this space.')
  }

  // Generic fallbacks (varied)
  if (ideas.length < 3) ideas.push('Run a 48h micro-experiment measuring one variable in this trend.')
  if (ideas.length < 3) ideas.push('Write a one-paragraph "what if this accelerates" scenario and one counter-scenario.')
  if (ideas.length < 3) ideas.push('Find the adjacent category or audience this trend is leaking into.')

  return ideas.slice(0, 3)
}

export function computeVelocity(history: number[]): number {
  if (history.length < 4) return 0.5
  const recent = history.slice(-6).reduce((a, b) => a + b, 0) / 6
  const older = history.slice(-12, -6).reduce((a, b) => a + b, 0) / 6 || recent
  const delta = Math.max(-0.4, Math.min(0.4, recent - older))
  return Math.max(0.1, Math.min(1, 0.45 + delta * 1.6))
}
