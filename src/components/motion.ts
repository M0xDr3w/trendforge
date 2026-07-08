import type { CSSProperties } from 'react'

export const pageVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
}

export const sectionVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.23, 1, 0.32, 1] as const },
  },
}

export const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.23, 1, 0.32, 1] as const },
  },
}

export const postEnterVariants = {
  initial: { opacity: 0, y: -22, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.32, ease: [0.23, 1, 0.32, 1] as const },
  },
  exit: { opacity: 0, height: 0, marginBottom: 0, transition: { duration: 0.2 } },
}

export const CLUSTER_SELECT_LAYOUT_ID = 'cluster-select-ring'

export function clusterBorderStyle(shift: number): CSSProperties {
  if (shift > 0.3) {
    return { borderLeftColor: 'var(--accent)', boxShadow: 'inset 3px 0 12px rgba(230, 0, 46, 0.15)' }
  }
  if (shift < -0.3) {
    return { borderLeftColor: '#60a5fa', boxShadow: 'inset 3px 0 12px rgba(96, 165, 250, 0.12)' }
  }
  return { borderLeftColor: 'rgba(230, 0, 46, 0.45)' }
}

export type ConnectionStatus = 'live' | 'ingest' | 'paused'

export function connectionLabel(status: ConnectionStatus): string {
  if (status === 'live') return 'LIVE X'
  if (status === 'ingest') return 'INGEST'
  return 'PAUSED'
}
