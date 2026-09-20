'use client'

import { Search } from 'lucide-react'
import { Avatar } from '@/components/app/ui'

export function Header({
  search,
  setSearch,
  matches,
  onSelectUser,
  view,
  roleLabel,
}: {
  search: string
  setSearch: (v: string) => void
  matches: { name: string; role: string; avatar: string }[]
  onSelectUser: (user: { name: string; role: string; avatar: string }) => void
  view: string
  roleLabel: string
}) {
  return (
    <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-4 px-5 py-5 md:px-8">
      <div className="relative max-w-xs flex-1">
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-2 backdrop-blur">
          <Search size={16} className="text-muted-foreground" />
          <input
            aria-label="Search users"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search people"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        {search && (
          <div className="absolute left-0 right-0 top-12 rounded-2xl border border-white/10 bg-[#151515] p-2 shadow-2xl">
            {matches.map(u => (
              <button
                key={u.name}
                onClick={() => onSelectUser(u)}
                className="flex w-full items-center gap-3 rounded-xl p-3 text-left hover:bg-white/10"
              >
                <Avatar text={u.avatar} />
                <span>
                  <b className="block text-sm">{u.name}</b>
                  <small className="text-muted-foreground">{u.role}</small>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <span className="text-sm font-black uppercase tracking-widest text-lime-300">
        {view === 'feed' ? 'For you' : roleLabel}
      </span>

      <span className="rounded-full border border-white/15 bg-black/30 px-3 py-2 text-xs font-black">
        {roleLabel}
      </span>
    </header>
  )
}
