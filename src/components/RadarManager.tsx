import { useState } from 'react'
import { Loader2, Plus, Radio, Trash2 } from 'lucide-react'
import type { SavedRadar } from '../lib/types'
import { formatLastSynced } from '../lib/radars'
import { GlowDivider, HudLabel, NeoButton, Panel } from './ui'

interface RadarManagerProps {
  radars: SavedRadar[]
  maxRadars: number
  defaultQueries: string[]
  syncingId: string | null
  onAdd: (name: string, query: string) => void
  onDelete: (id: string) => void
  onSync: (radar: SavedRadar) => void
  onSyncAll: () => void
}

export function RadarManager({
  radars,
  maxRadars,
  defaultQueries,
  syncingId,
  onAdd,
  onDelete,
  onSync,
  onSyncAll,
}: RadarManagerProps) {
  const [expanded, setExpanded] = useState(false)
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const atLimit = radars.length >= maxRadars
  const unusedDefaults = defaultQueries.filter(
    dq => !radars.some(r => r.query.toLowerCase() === dq.toLowerCase()),
  )

  const handleAdd = () => {
    onAdd(name, query)
    setName('')
    setQuery('')
    setExpanded(false)
  }

  const handleQuickAdd = (defaultQuery: string) => {
    const label = defaultQuery.length > 28 ? `${defaultQuery.slice(0, 25)}…` : defaultQuery
    onAdd(label, defaultQuery)
  }

  return (
    <div className="mt-4">
      <GlowDivider className="mb-3" />
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radio size={14} className="text-[var(--cyan)]" aria-hidden />
          <HudLabel className="text-xs tracking-[0.15em]">Saved radars</HudLabel>
        </div>
        <div className="flex items-center gap-2">
          <NeoButton
            size="xs"
            variant="ghost"
            onClick={onSyncAll}
            disabled={syncingId !== null || radars.length === 0}
            aria-label="Sync all saved radars"
          >
            Sync all
          </NeoButton>
          <span className="text-xs text-[var(--muted)]">
            {radars.length}/{maxRadars}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {radars.map(radar => {
          const syncing = syncingId === radar.id
          return (
            <Panel key={radar.id} padding="sm" className="text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-[var(--text)]">{radar.name}</div>
                  <div className="truncate text-xs text-[var(--muted)]" title={radar.query}>
                    {radar.query}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">
                    {formatLastSynced(radar.lastSynced)}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <NeoButton
                    size="xs"
                    variant="accent"
                    onClick={() => onSync(radar)}
                    disabled={syncing || syncingId !== null}
                    aria-label={`Sync radar ${radar.name}`}
                  >
                    {syncing ? <Loader2 size={12} className="animate-spin" aria-hidden /> : 'Sync'}
                  </NeoButton>
                  <NeoButton
                    size="xs"
                    variant="ghost"
                    onClick={() => onDelete(radar.id)}
                    disabled={syncingId !== null}
                    aria-label={`Delete radar ${radar.name}`}
                  >
                    <Trash2 size={12} aria-hidden />
                  </NeoButton>
                </div>
              </div>
            </Panel>
          )
        })}
      </div>

      {!atLimit && unusedDefaults.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {unusedDefaults.slice(0, 3).map(dq => (
            <NeoButton
              key={dq}
              size="xs"
              variant="ghost"
              onClick={() => handleQuickAdd(dq)}
              disabled={syncingId !== null}
              className="max-w-full truncate"
              title={`Add: ${dq}`}
            >
              + {dq.length > 22 ? `${dq.slice(0, 19)}…` : dq}
            </NeoButton>
          ))}
        </div>
      )}

      {expanded ? (
        <Panel padding="sm" className="mt-2 space-y-2">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Radar name"
            aria-label="Radar name"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--panel)] px-2 py-1.5 text-sm placeholder:text-[var(--muted)] focus:border-[var(--cyan)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cyan)]"
          />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="X search query"
            aria-label="X search query"
            className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--panel)] px-2 py-1.5 text-sm placeholder:text-[var(--muted)] focus:border-[var(--cyan)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cyan)]"
          />
          <div className="flex gap-2">
            <NeoButton size="xs" variant="accent" onClick={handleAdd} disabled={!name.trim() || !query.trim()}>
              Save radar
            </NeoButton>
            <NeoButton size="xs" onClick={() => setExpanded(false)}>
              Cancel
            </NeoButton>
          </div>
        </Panel>
      ) : (
        <NeoButton
          size="xs"
          className="mt-2"
          onClick={() => setExpanded(true)}
          disabled={atLimit || syncingId !== null}
          fullWidth
        >
          <Plus size={14} aria-hidden /> Add radar
        </NeoButton>
      )}

      {atLimit && (
        <p className="mt-1 text-center text-[10px] text-[var(--muted)]">Delete a radar to add another</p>
      )}
    </div>
  )
}
