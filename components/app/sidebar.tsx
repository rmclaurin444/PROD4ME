'use client'

import { Zap } from 'lucide-react'
import { getNav, type View } from '@/components/app/nav'

export function Sidebar({
  view,
  setView,
  isArtist,
  userName,
  userRole,
  onSignOut,
}: {
  view: View
  setView: (v: View) => void
  isArtist: boolean
  userName: string
  userRole: string
  onSignOut: () => void
}) {
  const nav = getNav(isArtist)

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-white/10 p-6 lg:flex">
      <div className="flex items-center gap-2">
        <div className="grid size-7 place-items-center rounded-md bg-lime-300 text-black">
          <Zap size={16} fill="currentColor" />
        </div>
        <span className="text-xl font-black tracking-tighter">
          PROD<span className="text-lime-300">4</span>ME
        </span>
      </div>

      <nav className="mt-14 flex flex-col gap-2">
        {nav.map(([id, Icon, label]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${
              view === id
                ? 'bg-lime-300 text-black'
                : 'text-muted-foreground hover:bg-white/5'
            }`}
          >
            <Icon size={19} />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-auto rounded-2xl border border-white/10 bg-white/[.03] p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-lime-300">
          {userRole === 'ARTIST' ? 'Artist' : 'Producer'}
        </p>
        <p className="mt-2 truncate text-sm font-semibold">{userName}</p>
        <button
          onClick={onSignOut}
          className="mt-4 w-full rounded-lg bg-white/10 px-3 py-2 text-xs font-bold"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}

export function MobileNav({
  view,
  setView,
  isArtist,
}: {
  view: View
  setView: (v: View) => void
  isArtist: boolean
}) {
  const nav = getNav(isArtist)

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-white/10 bg-black/85 p-3 backdrop-blur lg:hidden">
      {nav.map(([id, Icon, label]) => (
        <button
          key={id}
          onClick={() => setView(id)}
          className="flex flex-col items-center gap-1 text-[10px] font-bold"
        >
          <Icon size={19} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}
