'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Avatar } from '@/components/app/ui'
import type { ShapedFollowUser } from '@/lib/follows'

/**
 * Paged follower/following list for a profile (Prompt 13). 30 per page with
 * a Load more button. Rows show avatar, name, username, role, and whether
 * the current user follows them; tapping a row opens that user's profile.
 */
export function FollowListModal({
  username,
  list,
  onClose,
  onOpenProfile,
}: {
  username: string
  list: 'followers' | 'following'
  onClose: () => void
  onOpenProfile: (username: string) => void
}) {
  const [users, setUsers] = useState<ShapedFollowUser[] | null>(null)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(
    async (targetPage: number) => {
      setLoading(true)
      setError('')
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(username)}/${list}?page=${targetPage}`, {
          cache: 'no-store',
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Could not load the list')
        setUsers(current => (targetPage === 0 ? (data.users ?? []) : [...(current ?? []), ...(data.users ?? [])]))
        setHasMore(Boolean(data.hasMore))
        setPage(targetPage)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load the list')
      } finally {
        setLoading(false)
      }
    },
    [username, list]
  )

  useEffect(() => {
    void load(0)
  }, [load])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`${list === 'followers' ? 'Followers' : 'Following'} of ${username}`}
        className="max-h-[70vh] w-full max-w-md overflow-y-auto rounded-3xl border border-border bg-background p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black capitalize">
            {list === 'followers' ? 'Followers' : 'Following'} · {username}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close list"
            className="grid size-8 place-items-center rounded-full hover:bg-surface-2"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-error/30 bg-error/10 p-3 text-xs font-bold text-error">
            {error}
          </p>
        )}

        {loading && users === null ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </p>
        ) : (users ?? []).length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {list === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-1">
            {(users ?? []).map(user => (
              <button
                key={user.id}
                onClick={() => onOpenProfile(user.username)}
                className="flex items-center gap-3 rounded-xl p-3 text-left hover:bg-surface-2"
              >
                <Avatar text={user.name} src={user.avatarUrl} />
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{user.name}</b>
                  <small className="text-muted-foreground">@{user.username}</small>
                </span>
                {user.isFollowing && (
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-black text-muted-foreground">
                    Following
                  </span>
                )}
              </button>
            ))}
            {hasMore && (
              <button
                onClick={() => void load(page + 1)}
                disabled={loading}
                className="mt-2 rounded-xl border border-border py-2.5 text-[10px] font-black disabled:opacity-40"
              >
                {loading ? 'LOADING…' : 'LOAD MORE'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
