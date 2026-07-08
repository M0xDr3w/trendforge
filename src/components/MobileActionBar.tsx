import { Search, Lightbulb } from 'lucide-react'
import { NeoButton } from './ui'

interface MobileActionBarProps {
  onSyncReal: () => void
  onForge: () => void
}

export function MobileActionBar({ onSyncReal, onForge }: MobileActionBarProps) {
  return (
    <div className="mobile-action-bar fixed inset-x-0 bottom-0 z-50 px-4 py-3 lg:hidden">
      <div className="mx-auto flex max-w-lg gap-2">
        <NeoButton onClick={onSyncReal} variant="accent" fullWidth size="sm" aria-label="Sync real posts from X">
          <Search size={16} aria-hidden /> Sync real X
        </NeoButton>
        <NeoButton onClick={onForge} variant="primary" fullWidth size="sm" aria-label="Forge content angles">
          <Lightbulb size={16} aria-hidden /> Forge
        </NeoButton>
      </div>
    </div>
  )
}
