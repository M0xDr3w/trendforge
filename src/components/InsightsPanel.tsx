import { motion } from 'framer-motion'
import type { Insight } from '../lib/types'
import { HudLabel, Panel } from './ui'
import { cardVariants, pageVariants } from './motion'

interface InsightsPanelProps {
  insights: Insight[]
}

export function InsightsPanel({ insights }: InsightsPanelProps) {
  return (
    <div>
      <HudLabel className="mb-3 block text-xs tracking-[0.15em]">Insights &amp; gaps</HudLabel>
      <motion.div className="mb-6 space-y-2" initial="hidden" animate="visible" variants={pageVariants}>
        {insights.map((ins, idx) => (
          <motion.div key={`${ins.type}-${ins.title}-${idx}`} variants={cardVariants}>
            <Panel padding="sm" className="alert text-sm">
              <HudLabel className="mb-0.5 block text-[10px] text-[var(--accent)]">{ins.type}</HudLabel>
              <div className="mb-1 font-semibold">{ins.title}</div>
              <div className="mb-1.5 text-xs text-[var(--muted)]">{ins.detail}</div>
              <div className="text-xs text-[var(--green)]">→ {ins.action}</div>
            </Panel>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}
