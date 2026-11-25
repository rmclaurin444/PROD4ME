'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { Avatar } from '@/components/app/ui'
import { SEARCH_MIN_CHARS } from '@/lib/messaging/constants'

export type SearchedUser = {
  id: string
  name: string
  username: string
  role: string
  avatarUrl: string | null
}

/** Fetches GET /api/users/search for a query (debounce handled by caller). */
export async function searchUsers(q: string, signal?: AbortSignal): Promise<SearchedUser[]> {
  const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, { signal })
  if (!res.ok) throw new Error('Search failed')
  const data = await res.json()
  return data.users ?? []
}

export function UserSearchResultRow({
  user,
  onSelect,
}: {
  user: SearchedUser
  onSelect: (user: SearchedUser) => void
}) {
  return (
    <button
      onClick={() => onSelect(user)}
      className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-surface-2"
    >
      <Avatar text={user.name} src={user.avatarUrl} />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-sm">{user.name}</b>
        <small className="text-muted-foreground">@{user.username}</small>
      </span>
      <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-black text-muted-foreground">
        {user.role === 'ARTIST' ? 'Artist' : 'Producer'}
      </span>
    </button>
  )
}

/**
 * Debounced (250ms) user search box with its own results list. Reused by
 * the new-message flow and the share-a-beat picker.
 */
export function UserSearch({
  onSelect,
  placeholder = 'Search people',
  autoFocus = false,
}: {
  onSelect: (user: SearchedUser) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchedUser[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (q.length < SEARCH_MIN_CHARS) {
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
        setError('')
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError('Search failed')
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
    <div>
      <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-2">
        <Search size={16} className="text-muted-foreground" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- modal search box
          autoFocus={autoFocus}
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {loading && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
      </div>

      {error && <p className="mt-2 text-xs font-semibold text-error">{error}</p>}

      {results !== null && (
        <div className="mt-2 flex flex-col gap-1">
          {results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              No people found for “{query.trim()}”.
            </p>
          ) : (
            results.map(user => <UserSearchResultRow key={user.id} user={user} onSelect={onSelect} />)
          )}
        </div>
      )}
    </div>
  )
}
