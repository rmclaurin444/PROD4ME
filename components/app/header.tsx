'use client'

import { useEffect, useRef, useState } from 'react'
import { Search, Settings } from 'lucide-react'
import { Avatar } from '@/components/app/ui'
import { ThemeToggleCompact } from '@/components/app/theme-toggle'
import { searchUsers, type SearchedUser } from '@/components/app/messages/user-search'

export function Header({
  onSelectUser,
  view,
  roleLabel,
  onOpenSettings,
}: {
  onSelectUser: (user: SearchedUser) => void
  view: string
  roleLabel: string
  onOpenSettings: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchedUser[] | null>(null)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<number | null>(null)

  // debounced real search against GET /api/users/search
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults(null)
      setLoading(false)
      return
    }

    setLoading(true)
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    const controller = new AbortController()
    debounceRef.current = window.setTimeout(async () => {
      try {
        const users = await searchUsers(q, controller.signal)
        setResults(users)
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => {
      controller.abort()
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    }
  }, [query])

  return (
    // The header floats over beat artwork in the feed, so its chrome keeps the
    // dark scrim + white treatment in BOTH modes (artwork-overlay exception).
    <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-4 px-5 py-5 md:px-8">
      <div className="relative max-w-xs flex-1">
        <div className="flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-2 backdrop-blur">
          <Search size={16} className="text-muted-foreground" />
          <input
            aria-label="Search people"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search people"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        {query.trim().length >= 2 && results !== null && (
          <div className="absolute left-0 right-0 top-12 max-h-96 overflow-y-auto rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-2xl">
            {results.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                {loading ? 'Searching…' : 'No people found.'}
              </p>
            ) : (
              results.map(user => (
                <button
                  key={user.id}
                  onClick={() => {
                    onSelectUser(user)
                    setQuery('')
                    setResults(null)
                  }}
                  className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-surface-2"
                >
                  <Avatar text={user.name} src={user.avatarUrl} />
                  <span className="min-w-0">
                    <b className="block truncate text-sm">{user.name}</b>
                    <small className="text-muted-foreground">@{user.username}</small>
                  </span>
                  <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-black text-muted-foreground">
                    {user.role === 'ARTIST' ? 'Artist' : 'Producer'}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* center label: the feed shows the Following | For You tabs instead
          (Prompt 13), so the role chip only appears on the other views */}
      {view !== 'feed' && (
        <span className="text-sm font-black uppercase tracking-widest text-brand">
          {roleLabel}
        </span>
      )}

      <div className="flex items-center gap-3">
        <ThemeToggleCompact />
        <button
          onClick={onOpenSettings}
          aria-label="Open settings"
          title="Settings"
          className="grid size-9 place-items-center rounded-full border border-white/15 bg-black/30 text-white backdrop-blur transition hover:bg-black/50"
        >
          <Settings size={16} />
        </button>
        {/* scrim chip: header sits over artwork in the feed */}
        <span className="rounded-full border border-white/15 bg-black/30 px-3 py-2 text-xs font-black text-white backdrop-blur">
          {roleLabel}
        </span>
      </div>
    </header>
  )
}
