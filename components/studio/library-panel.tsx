'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, FileAudio, Import, Music2 } from 'lucide-react'
import type { StudioBeat } from '@/lib/studio/types'
import { DEMO_IMPORTED_AUDIO } from '@/lib/studio/mock-data'
import { AccessBadge } from '@/components/studio/studio-home'

const BEAT_MIME = 'application/x-prod4me-beat'
const IMPORTED_MIME = 'application/x-prod4me-imported'

export function LibraryPanel({
  open,
  onToggle,
  beats,
  onBeatDoubleClick,
}: {
  open: boolean
  onToggle: () => void
  beats: StudioBeat[]
  onBeatDoubleClick: (beatId: string) => void
}) {
  const [tab, setTab] = useState<'beats' | 'imported'>('beats')

  return (
    <div
      className={`flex shrink-0 flex-col overflow-hidden border-r border-white/10 bg-black/20 transition-all ${
        open ? 'w-72' : 'w-10'
      }`}
    >
      <button
        onClick={onToggle}
        aria-label={open ? 'Collapse library' : 'Expand library'}
        className="flex w-full items-center justify-center gap-1 border-b border-white/10 py-2 text-xs font-black text-muted-foreground hover:text-lime-300"
      >
        {open ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
        {open ? 'Collapse' : 'Library'}
      </button>

      {open && (
        <>
          <div className="flex border-b border-white/10">
            {(
              [
                ['beats', 'My Beats', <Music2 key="i" size={13} />],
                ['imported', 'Imported Audio', <Import key="i" size={13} />],
              ] as const
            ).map(([id, label, icon]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[11px] font-black uppercase tracking-wider ${
                  tab === id ? 'border-b-2 border-lime-300 text-lime-300' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          <div
            className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3"
            onDragStart={e => {
              // safety net: anything dragged out of the library must not
              // carry a stray file payload
              if (e.dataTransfer.types.length === 0) e.preventDefault()
            }}
          >
            {tab === 'beats' ? (
              <>
                <p className="px-1 pb-1 text-[10px] font-bold text-muted-foreground">
                  Drag a beat onto the beat track (or double-click it).
                </p>
                {beats.map(beat => (
                  <div
                    key={beat.id}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData(BEAT_MIME, beat.id)
                      e.dataTransfer.setData('text/plain', beat.title)
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    onDoubleClick={() => onBeatDoubleClick(beat.id)}
                    className="flex cursor-grab items-center gap-2.5 rounded-xl border border-white/5 bg-white/[.03] px-3 py-2.5 hover:border-lime-300/40"
                    title="Drag into the timeline, or double-click to load"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-lime-300/15 text-lime-300">
                      <Music2 size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-black">
                        {beat.title}
                        {beat.isDemo && (
                          <span className="ml-1.5 rounded bg-white/10 px-1 py-0.5 text-[9px] font-bold text-muted-foreground">
                            Demo
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {beat.producer} · {beat.bpm ?? '—'} BPM
                      </span>
                    </span>
                    <AccessBadge access={beat.access} />
                  </div>
                ))}
              </>
            ) : (
              <>
                <p className="px-1 pb-1 text-[10px] font-bold text-muted-foreground">
                  Drag audio anywhere in the timeline to place it.
                </p>
                {DEMO_IMPORTED_AUDIO.map(item => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData(IMPORTED_MIME, item.id)
                      e.dataTransfer.setData('text/plain', item.name)
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    className="flex cursor-grab items-center gap-2.5 rounded-xl border border-white/5 bg-white/[.03] px-3 py-2.5 hover:border-lime-300/40"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sky-400/15 text-sky-300">
                      <FileAudio size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-black">{item.name}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {item.durationSec}s · imported
                      </span>
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
