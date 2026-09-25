import { Bookmark, FolderOpen, LogIn, LogOut, RefreshCw, Search, Shapes } from 'lucide-react'
import { useMemo } from 'react'
import type { BookmarkFolder, BookmarkPost, BookmarkTheme } from '../lib/bookmarks'
import { HudLabel, NeoButton, Panel, FieldInput } from './ui'

interface BookmarksPanelProps {
  signedIn: boolean
  username: string | null
  authChecking: boolean
  demoMode: boolean
  posts: BookmarkPost[]
  folders: BookmarkFolder[]
  themes: BookmarkTheme[]
  activeFolder: string
  activeTheme: string
  query: string
  syncing: boolean
  discovering: boolean
  lastSync: string | null
  citedIds: string[]
  forging: boolean
  onLogin: () => void
  onLogout: () => void
  onSync: () => void
  onDiscoverThemes: () => void
  onFolderChange: (id: string) => void
  onThemeChange: (id: string) => void
  onQueryChange: (q: string) => void
  onToggleCite: (id: string) => void
  onForgeFromBookmarks: () => void
}

export function BookmarksPanel({
  signedIn,
  username,
  authChecking,
  demoMode,
  posts,
  folders,
  themes,
  activeFolder,
  activeTheme,
  query,
  syncing,
  discovering,
  lastSync,
  citedIds,
  forging,
  onLogin,
  onLogout,
  onSync,
  onDiscoverThemes,
  onFolderChange,
  onThemeChange,
  onQueryChange,
  onToggleCite,
  onForgeFromBookmarks,
}: BookmarksPanelProps) {
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const themeIds = activeTheme ? (themes.find(t => t.id === activeTheme)?.postIds || []) : null
    return posts.filter(p => {
      if (activeFolder && !(p.folderIds || []).includes(activeFolder)) return false
      if (themeIds && !themeIds.includes(p.id)) return false
      if (!q) return true
      return (
        p.text.toLowerCase().includes(q) ||
        p.username.toLowerCase().includes(q)
      )
    })
  }, [posts, activeFolder, activeTheme, themes, query])

  const canDiscover = demoMode || signedIn

  return (
    <Panel glow padding="md">
      <div className="mb-1 flex items-center justify-between gap-2">
        <HudLabel className="flex items-center gap-2 text-xs">
          <Bookmark size={14} aria-hidden /> Bookmark Forge
        </HudLabel>
        {demoMode ? (
          <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-amber-300">
            DEMO FIXTURES
          </span>
        ) : signedIn ? (
          <span className="rounded-full border border-[var(--green)]/40 bg-[var(--green)]/10 px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-[var(--green)]">
            @{username || 'you'} · SIGNED IN
          </span>
        ) : (
          <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] tracking-[0.12em] text-[var(--muted)]">
            SIGNED OUT
          </span>
        )}
      </div>
      <p className="mb-3 text-sm text-[var(--muted)]">
        Turns what you already save on X into a weekly brief and ready-to-edit threads.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        {authChecking ? (
          <span className="text-xs text-[var(--muted)]">Checking session…</span>
        ) : signedIn && !demoMode ? (
          <>
            <NeoButton size="xs" variant="accent" onClick={onSync} disabled={syncing} aria-label="Sync X bookmarks">
              <RefreshCw size={13} aria-hidden className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync bookmarks'}
            </NeoButton>
            <NeoButton size="xs" variant="ghost" onClick={onLogout} aria-label="Sign out of X">
              <LogOut size={13} aria-hidden /> Sign out
            </NeoButton>
          </>
        ) : (
          <NeoButton
            size="xs"
            variant="accent"
            onClick={onLogin}
            disabled={demoMode}
            title={demoMode ? 'Disabled in demo mode' : 'Sign in with X (OAuth 2.0 + PKCE)'}
            aria-label="Sign in with X"
          >
            <LogIn size={13} aria-hidden /> Sign in with X
          </NeoButton>
        )}
        {lastSync && (
          <span className="self-center text-[11px] text-[var(--muted)]">
            {posts.length} saves · synced {new Date(lastSync).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      <div className="mb-3 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--input-bg)] p-2.5">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <HudLabel className="flex items-center gap-1.5 text-[10px]">
            <Shapes size={12} aria-hidden /> Themes · discovered from your saves
          </HudLabel>
          {canDiscover && themes.length === 0 && (
            <NeoButton
              size="xs"
              variant="ghost"
              onClick={onDiscoverThemes}
              disabled={discovering || posts.length === 0}
              aria-label="Discover themes from saves"
            >
              {discovering ? 'Discovering…' : 'Discover themes'}
            </NeoButton>
          )}
        </div>
        {themes.length > 0 ? (
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Discovered themes">
            <NeoButton
              size="xs"
              variant={activeTheme === '' ? 'active' : 'ghost'}
              onClick={() => onThemeChange('')}
              role="tab"
              aria-selected={activeTheme === ''}
            >
              All · {posts.length}
            </NeoButton>
            {themes.map(t => (
              <NeoButton
                key={t.id}
                size="xs"
                variant={activeTheme === t.id ? 'active' : 'ghost'}
                onClick={() => onThemeChange(t.id)}
                role="tab"
                aria-selected={activeTheme === t.id}
                title={`${t.count} saves · tap to filter posts`}
              >
                {t.name} · {t.count}
              </NeoButton>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-[var(--muted)]">
            {signedIn || demoMode
              ? 'No themes yet — sync saves, then discover the themes running through them. Labels are cached, so re-syncs only process new saves.'
              : 'Sign in and sync to discover the themes running through your saves.'}
          </p>
        )}
        {canDiscover && themes.length > 0 && (
          <button
            type="button"
            onClick={onDiscoverThemes}
            disabled={discovering}
            className="mt-1.5 text-[11px] text-[var(--muted)] underline underline-offset-2 hover:text-[var(--text)]"
            aria-label="Refresh theme discovery"
          >
            {discovering ? 'Discovering…' : 'Refresh themes'}
          </button>
        )}
      </div>

      {folders.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Bookmark folders">
          <NeoButton
            size="xs"
            variant={activeFolder === '' ? 'active' : 'ghost'}
            onClick={() => onFolderChange('')}
            role="tab"
            aria-selected={activeFolder === ''}
          >
            <FolderOpen size={12} aria-hidden /> All folders
          </NeoButton>
          {folders.map(f => (
            <NeoButton
              key={f.id}
              size="xs"
              variant={activeFolder === f.id ? 'active' : 'ghost'}
              onClick={() => onFolderChange(f.id)}
              role="tab"
              aria-selected={activeFolder === f.id}
            >
              {f.name}
            </NeoButton>
          ))}
        </div>
      )}

      <div className="relative mb-2">
        <FieldInput
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          placeholder="Search saved bookmarks (keyword)…"
          aria-label="Search saved bookmarks"
          className="py-2 pl-9 pr-3 text-xs"
        />
        <Search size={14} className="pointer-events-none absolute left-3 top-2.5 text-[var(--muted)]" aria-hidden />
      </div>

      {visible.length === 0 ? (
        <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted)]">
          {signedIn || demoMode
            ? 'No saves match. Sync bookmarks or clear the search.'
            : 'Sign in with X and sync to fill this panel with your own saves.'}
        </p>
      ) : (
        <div className="max-h-[380px] space-y-2 overflow-auto pr-1">
          {visible.slice(0, 30).map(p => {
            const cited = citedIds.includes(p.id)
            return (
              <div
                key={p.id}
                className={`rounded-[var(--radius-sm)] border p-2.5 text-[13px] leading-snug ${
                  cited ? 'border-[var(--accent)]/60 bg-[var(--accent)]/5' : 'border-[var(--border)] bg-[var(--input-bg)]'
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
                  <span className="truncate font-medium text-[var(--text)]">@{p.username}</span>
                  <button
                    type="button"
                    onClick={() => onToggleCite(p.id)}
                    aria-pressed={cited}
                    aria-label={cited ? `Uncite save ${p.id}` : `Cite save ${p.id} in forge`}
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${
                      cited
                        ? 'border-[var(--accent)] text-[var(--accent)]'
                        : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    {cited ? '✓ cited' : 'cite'}
                  </button>
                </div>
                <p className="text-[var(--text)]">{p.text}</p>
              </div>
            )
          })}
        </div>
      )}

      <NeoButton
        size="sm"
        variant="primary"
        fullWidth
        className="mt-3"
        disabled={visible.length === 0 || forging}
        onClick={onForgeFromBookmarks}
        aria-label="Forge thread ideas from cited saves"
      >
        {forging ? 'Forging…' : `Forge from ${citedIds.length > 0 ? `${citedIds.length} cited` : 'saves'}`}
      </NeoButton>
      <p className="mt-1 text-center text-[10px] text-[var(--muted)]">
        Ideas cite the saves they draw on · never posts to X · accept/edit/reject below in the forge panel
      </p>
    </Panel>
  )
}
