'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Lock, Loader2, Pencil } from 'lucide-react'
import type { BeatAccess, SaveStatus } from '@/lib/studio/types'
import { AccessBadge } from '@/components/studio/studio-home'

const SAVE_LABEL: Record<SaveStatus, string> = {
  saved: 'All changes saved',
  saving: 'Saving…',
  unsaved: 'Unsaved changes',
}

export function TopBar({
  name,
  saveStatus,
  access,
  offerPending,
  canExport,
  onBack,
  onRename,
  onExport,
}: {
  name: string
  saveStatus: SaveStatus
  access: BeatAccess | null
  offerPending: boolean
  canExport: boolean
  onBack: () => void
  onRename: (name: string) => void
  onExport: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => setDraft(name), [name])
  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next && next !== name) onRename(next)
    else setDraft(name)
  }

  return (
    <div className="flex shrink-0 items-center gap-4 border-b border-white/10 bg-black/40 px-5 py-3">
      <button
        onClick={onBack}
        aria-label="Back to Studio Home"
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-bold text-muted-foreground hover:text-lime-300"
      >
        <ArrowLeft size={16} />
        Home
      </button>

      <div className="flex min-w-0 items-center gap-2">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setDraft(name)
                setEditing(false)
              }
            }}
            className="w-64 rounded-lg border border-lime-300/60 bg-white/[.06] px-3 py-1.5 text-sm font-black outline-none"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="group flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-white/5"
          >
            <span className="truncate text-lg font-black">{name}</span>
            <Pencil size={13} className="shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100" />
          </button>
        )}
      </div>

      <span
        className={`flex items-center gap-1.5 text-xs font-bold ${
          saveStatus === 'unsaved' ? 'text-amber-300' : saveStatus === 'saving' ? 'text-muted-foreground' : 'text-lime-300'
        }`}
      >
        {saveStatus === 'saved' ? <Check size={13} /> : saveStatus === 'saving' ? <Loader2 size={13} className="animate-spin" /> : null}
        {SAVE_LABEL[saveStatus]}
      </span>

      {access === 'trial' && (
        <span className="flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-300">
          {offerPending ? <Lock size={11} /> : null}
          Trial
        </span>
      )}
      {access !== null && access !== 'trial' && <AccessBadge access={access} />}
      {access === null && (
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
          No beat
        </span>
      )}

      {/*
        Trial Export stays clickable but visually disabled so it can explain
        itself (license required) in a modal instead of doing nothing.
      */}
      <button
        onClick={onExport}
        aria-disabled={!canExport}
        className={`ml-auto rounded-xl px-5 py-2 text-sm font-black ${
          canExport
            ? 'bg-lime-300 text-black hover:bg-lime-200'
            : 'cursor-not-allowed bg-white/5 text-muted-foreground hover:bg-white/10'
        }`}
      >
        {canExport ? 'Export' : <span className="flex items-center gap-1.5"><Lock size={13} /> Export</span>}
      </button>
    </div>
  )
}
