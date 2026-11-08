'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Sliders, Sparkles } from 'lucide-react'
import type { StudioTrack } from '@/lib/studio/types'
import { EFFECT_OPTIONS } from '@/lib/studio/mock-data'

export function BottomPanel({
  tab,
  onTab,
  tracks,
  onPatchTrack,
}: {
  tab: 'mixer' | 'effects'
  onTab: (tab: 'mixer' | 'effects') => void
  tracks: StudioTrack[]
  onPatchTrack: (trackId: string, updater: (t: StudioTrack) => StudioTrack) => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="shrink-0 border-t border-white/10 bg-black/25">
      <div className="flex items-center gap-1 px-4 py-1.5">
        <button
          onClick={() => onTab('mixer')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black ${
            tab === 'mixer' ? 'bg-white/10 text-lime-300' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Sliders size={14} />
          Mixer
        </button>
        <button
          onClick={() => onTab('effects')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black ${
            tab === 'effects' ? 'bg-white/10 text-lime-300' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Sparkles size={14} />
          Effects
        </button>
        <button
          onClick={() => setOpen(v => !v)}
          aria-label={open ? 'Collapse bottom panel' : 'Expand bottom panel'}
          className="ml-auto grid size-7 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
        >
          {open ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </button>
      </div>

      {open && (
        <div className="flex gap-3 overflow-x-auto px-4 pb-4 pt-0.5" style={{ height: 170 }}>
          {tab === 'mixer'
            ? tracks.map(track => (
                <div
                  key={track.id}
                  className={`flex w-40 shrink-0 flex-col items-center rounded-2xl border border-white/5 bg-white/[.03] px-3 py-3 ${
                    track.kind === 'beat' ? 'text-lime-300' : ''
                  }`}
                >
                  <span className={`w-full truncate text-center text-xs font-black ${track.kind === 'beat' ? '' : 'text-foreground'}`}>
                    {track.name}
                  </span>
                  <span className="mt-2 w-full text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                    Volume {track.volume}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={track.volume}
                    onChange={e => onPatchTrack(track.id, t => ({ ...t, volume: Number(e.target.value) }))}
                    aria-label={`${track.name} mixer volume`}
                    className="w-full accent-lime-300"
                  />
                  <span className="mt-1 w-full text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                    Pan {track.pan === 0 ? 'C' : track.pan > 0 ? `R${track.pan}` : `L${Math.abs(track.pan)}`}
                  </span>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={track.pan}
                    onChange={e => onPatchTrack(track.id, t => ({ ...t, pan: Number(e.target.value) }))}
                    aria-label={`${track.name} mixer pan`}
                    className="w-full accent-sky-300"
                  />
                  <span className="mt-2 text-[9px] font-bold text-muted-foreground">
                    {track.muted ? 'Muted' : track.soloed ? 'Soloed' : '—'}
                  </span>
                </div>
              ))
            : tracks.map(track => (
                <div
                  key={track.id}
                  className="flex w-72 shrink-0 flex-col rounded-2xl border border-white/5 bg-white/[.03] px-3 py-3"
                >
                  <span className="truncate text-xs font-black">{track.name}</span>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {track.effectSlots.map(slot => (
                      <div
                        key={slot.slot}
                        className="flex items-center justify-between rounded-lg border border-dashed border-white/10 px-2 py-1.5 text-[10px] font-bold text-muted-foreground"
                      >
                        <span>Slot {slot.slot}</span>
                        <span className="text-muted-foreground/50">{slot.effectId ?? 'Empty'}</span>
                      </div>
                    ))}
                  </div>
                  {/* Effects land here once the processing pipeline exists —
                      the insert-slot structure is already wired for them. */}
                  <div className="group relative mt-2">
                    <button className="flex w-full items-center justify-center gap-1 rounded-lg bg-white/[.06] py-1.5 text-[10px] font-black text-muted-foreground">
                      <Plus size={12} />
                      Add Effect
                    </button>
                    <div className="invisible absolute bottom-full left-0 z-40 mb-1 w-full rounded-xl border border-white/10 bg-[#151515] p-1 opacity-0 shadow-2xl transition group-hover:visible group-hover:opacity-100">
                      {EFFECT_OPTIONS.map(effect => (
                        <button
                          key={effect.id}
                          disabled
                          title="Coming soon"
                          className="flex w-full cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-bold text-muted-foreground/50"
                        >
                          {effect.label}
                          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-300/70">
                            Coming Soon
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
        </div>
      )}
    </div>
  )
}
