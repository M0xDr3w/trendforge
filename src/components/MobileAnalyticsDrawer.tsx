import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { BarChart3, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import type { Cluster, XPost } from '../lib/types'
import { HudLabel, NeoButton, Panel } from './ui'

const AnalyticsSidebar = lazy(() =>
  import('./AnalyticsSidebar').then(m => ({ default: m.AnalyticsSidebar })),
)

interface MobileAnalyticsDrawerProps {
  posts: XPost[]
  clusters: Cluster[]
  onSelectCluster?: (name: string) => void
  onSyncReal?: () => void
}

function AnalyticsFallback() {
  return (
    <Panel padding="md" className="flex h-48 items-center justify-center text-xs text-[var(--muted)]">
      Loading analytics…
    </Panel>
  )
}

export function MobileAnalyticsDrawer({
  posts,
  clusters,
  onSelectCluster,
  onSyncReal,
}: MobileAnalyticsDrawerProps) {
  const [open, setOpen] = useState(false)
  const reduceMotion = useReducedMotion()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    closeButtonRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      trigger?.focus()
    }
  }, [open])

  const sidebar = (
    <Suspense fallback={<AnalyticsFallback />}>
      <AnalyticsSidebar
        posts={posts}
        clusters={clusters}
        onSelectCluster={onSelectCluster}
        onSyncReal={onSyncReal}
      />
    </Suspense>
  )

  return (
    <>
      <div className="hidden lg:block">{sidebar}</div>

      <div className="lg:hidden">
        <NeoButton
          ref={triggerRef}
          onClick={() => setOpen(true)}
          variant="ghost"
          size="sm"
          className="fixed bottom-[5.5rem] left-4 z-40 border-[var(--border-glow)] bg-[var(--panel-glass)] shadow-[var(--shadow-glow)] backdrop-blur-md"
          aria-label="Open analytics drawer"
          aria-expanded={open}
        >
          <BarChart3 size={16} aria-hidden /> Analytics
        </NeoButton>

        <AnimatePresence>
          {open && (
            <>
              <motion.button
                type="button"
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.2 }}
                onClick={() => setOpen(false)}
                aria-label="Close analytics drawer"
              />
              <motion.div
                className="fixed inset-x-0 bottom-0 z-50 max-h-[78vh] overflow-hidden rounded-t-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg)] shadow-[0_-8px_40px_rgba(0,0,0,0.5)]"
                initial={reduceMotion ? false : { y: '100%' }}
                animate={{ y: 0 }}
                exit={reduceMotion ? undefined : { y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 320 }}
                role="dialog"
                aria-modal="true"
                aria-label="Analytics drawer"
              >
                <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                  <HudLabel className="flex items-center gap-2 text-xs">
                    <BarChart3 size={14} aria-hidden /> Signal analytics
                  </HudLabel>
                  <NeoButton
                    ref={closeButtonRef}
                    onClick={() => setOpen(false)}
                    size="xs"
                    variant="ghost"
                    aria-label="Close analytics"
                  >
                    <X size={14} aria-hidden />
                  </NeoButton>
                </div>
                <div className="max-h-[calc(78vh-3.25rem)] overflow-y-auto p-4">{sidebar}</div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
