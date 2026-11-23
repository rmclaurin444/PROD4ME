'use client'

import Link from 'next/link'
import { Zap, FlaskConical, AudioLines } from 'lucide-react'
import { getNav, type View } from '@/components/app/nav'
import { ThemeToggle } from '@/components/app/theme-toggle'

export function Sidebar({
  view,
  setView,
  isArtist,
  userName,
  userRole,
  onSignOut,
  /** Admin-only: renders the /dev panel link (Analytics in prod, tools in dev). */
  isAdmin,
}: {
  view: View
  setView: (v: View) => void
  isArtist: boolean
  userName: string
  userRole: string
  onSignOut: () => void
  isAdmin?: boolean
}) {
  const nav = getNav(isArtist)

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border p-6 lg:flex">
      <div className="flex items-center gap-2">
        <div className="grid size-7 place-items-center rounded-md bg-brand text-brand-foreground">
          <Zap size={16} fill="currentColor" />
        </div>
        <span className="text-xl font-black tracking-tighter">
          PROD<span className="text-brand">4</span>ME
        </span>
      </div>

      <nav className="mt-14 flex flex-col gap-2">
        {nav.map(([id, Icon, label]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${
              view === id
                ? 'bg-brand text-brand-foreground'
                : 'text-muted-foreground hover:bg-surface-2'
            }`}
          >
            <Icon size={19} />
            {label}
          </button>
        ))}
        {/* Studio lives on its own protected route (/studio) — rendered as a
            routed link for both roles (producers for engineering). */}
        <Link
          href="/studio"
          className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-muted-foreground hover:bg-surface-2/50"
        >
          <AudioLines size={19} />
          Studio
        </Link>
        {isAdmin && (
          <a
            href="/dev"
            className="mt-2 flex items-center gap-3 rounded-xl px-4 py-2 text-xs font-semibold text-muted-foreground/60 hover:bg-surface-2 hover:text-brand"
          >
            <FlaskConical size={14} />
            Dev panel
          </a>
        )}
      </nav>

      <div className="mt-auto rounded-2xl border border-border bg-surface p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-brand">
          {userRole === 'ARTIST' ? 'Artist' : 'Producer'}
        </p>
        <p className="mt-2 truncate text-sm font-semibold">{userName}</p>
        <div className="mt-3">
          <ThemeToggle />
        </div>
        <button
          onClick={onSignOut}
          className="mt-3 w-full rounded-lg bg-surface-2 px-3 py-2 text-xs font-bold"
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
    <div className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border bg-background/85 p-3 backdrop-blur lg:hidden">
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
      <Link href="/studio" className="flex flex-col items-center gap-1 text-[10px] font-bold">
        <AudioLines size={19} />
        <span>Studio</span>
      </Link>
    </div>
  )
}
