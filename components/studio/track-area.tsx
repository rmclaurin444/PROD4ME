'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Bus,
  Copy,
  Grid3x3,
  Magnet,
  Mic,
  Minus,
  MoreHorizontal,
  Pencil,
  Palette,
  Plus,
  Trash2,
} from 'lucide-react'
import type { StudioClip, StudioProject, StudioTrack, TransportState } from '@/lib/studio/types'
import {
  CLIP_COLORS,
  LANE_H,
  MOCK_INPUTS,
  RULER_H,
  TRACK_HEADER_W,
  beatsPerBar,
  snapTime,
} from '@/lib/studio/mock-data'

const BEAT_MIME = 'application/x-prod4me-beat'
const IMPORTED_MIME = 'application/x-prod4me-imported'
const MIN_CLIP_DUR = 0.25

/** Solid header-strip hue for each CLIP_COLORS slot. */
const STRIP_COLORS = [
  'bg-lime-300',
  'bg-emerald-500',
  'bg-teal-500',
  'bg-amber-400',
  'bg-rose-500',
  'bg-sky-500',
]

type DragMode = 'move' | 'trim-start' | 'trim-end'

type DragState = {
  mode: DragMode
  trackId: string
  clipId: string
  startX: number
  origStart: number
  origDur: number
  origOffset: number
}

export function TrackArea({
  project,
  pxPerSec,
  playhead,
  transport,
  loopEnd,
  note,
  zoom,
  selectedTrackId,
  onZoom,
  onSelectTrack,
  onToggleSnap,
  onMoveClip,
  onTrimClip,
  onPatchTrack,
  onArm,
  onAddTrack,
  onRenameTrack,
  onDuplicateTrack,
  onDeleteTrack,
  onSetTrackColor,
  onDropFile,
  onDropImported,
  onDropBeat,
}: {
  project: StudioProject
  pxPerSec: number
  playhead: number
  transport: TransportState
  loopEnd: number
  note: { kind: 'error' | 'info'; text: string } | null
  zoom: number
  selectedTrackId: string
  onZoom: (zoom: number) => void
  onSelectTrack: (trackId: string) => void
  onToggleSnap: () => void
  onMoveClip: (trackId: string, clipId: string, startSec: number) => void
  onTrimClip: (
    trackId: string,
    clipId: string,
    startSec: number,
    durationSec: number,
    offsetSec: number
  ) => void
  onPatchTrack: (trackId: string, updater: (t: StudioTrack) => StudioTrack) => void
  onArm: (trackId: string) => void
  onAddTrack: () => void
  onRenameTrack: (trackId: string, name: string) => void
  onDuplicateTrack: (trackId: string) => void
  onDeleteTrack: (trackId: string) => void
  onSetTrackColor: (trackId: string, colorIndex: number) => void
  onDropFile: (fileName: string, trackId: string | null, atSec: number) => void
  onDropImported: (itemId: string, trackId: string | null, atSec: number) => void
  onDropBeat: (beatId: string) => void
}) {
  const perBar = beatsPerBar(project.timeSignature)
  const beatPx = (60 / Math.max(1, project.bpm)) * pxPerSec
  const barPx = beatPx * perBar
  const showBeatLines = beatPx >= 8

  // content length: the last thing on the grid plus an 8-bar tail so there is
  // always room to drop new clips
  let lastEnd = loopEnd
  for (const t of project.tracks) for (const c of t.clips) lastEnd = Math.max(lastEnd, c.startSec + c.durationSec)
  const tail = barPx > 0 ? (8 * perBar * 60) / Math.max(1, project.bpm) : 8
  const contentSec = lastEnd + tail
  const contentPx = Math.max(Math.ceil(contentSec * pxPerSec), 0)

  // ---- clip drag / trim ------------------------------------------------------

  const dragRef = useRef<DragState | null>(null)
  const settingsRef = useRef({ snap: project.snap, bpm: project.bpm, pxPerSec })
  settingsRef.current = { snap: project.snap, bpm: project.bpm, pxPerSec }

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const s = dragRef.current
      if (!s) return
      const { snap, bpm, pxPerSec: px } = settingsRef.current
      const dx = (e.clientX - s.startX) / px

      if (s.mode === 'move') {
        onMoveClip(s.trackId, s.clipId, Math.max(0, snapTime(s.origStart + dx, snap, bpm)))
      } else if (s.mode === 'trim-start') {
        const raw = s.origStart + dx
        const start = Math.min(
          Math.max(0, snapTime(raw, snap, bpm)),
          s.origStart + s.origDur - MIN_CLIP_DUR
        )
        const newDur = Math.max(MIN_CLIP_DUR, s.origDur - (start - s.origStart))
        const newOffset = Math.max(0, s.origOffset + (start - s.origStart))
        onTrimClip(s.trackId, s.clipId, start, newDur, newOffset)
      } else {
        const newDur = Math.max(MIN_CLIP_DUR, snapTime(s.origDur + dx, snap, bpm))
        onTrimClip(s.trackId, s.clipId, s.origStart, newDur, s.origOffset)
      }
    }
    const endPointer = () => {
      dragRef.current = null
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', endPointer)
    window.addEventListener('pointercancel', endPointer)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', endPointer)
      window.removeEventListener('pointercancel', endPointer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const grab = (mode: DragMode, e: React.PointerEvent, trackId: string, clip: StudioClip) => {
    if (e.button !== 0) return
    if (mode === 'move') onSelectTrack(trackId)
    e.stopPropagation()
    dragRef.current = {
      mode,
      trackId,
      clipId: clip.id,
      startX: e.clientX,
      origStart: clip.startSec,
      origDur: clip.durationSec,
      origOffset: clip.offsetSec,
    }
  }

  // ---- drops -----------------------------------------------------------------

  const readPayload = (
    e: React.DragEvent
  ): { kind: 'file'; name: string } | { kind: 'beat'; id: string } | { kind: 'imported'; id: string } | null => {
    const beatId = e.dataTransfer.getData(BEAT_MIME)
    if (beatId) return { kind: 'beat', id: beatId }
    const importedId = e.dataTransfer.getData(IMPORTED_MIME)
    if (importedId) return { kind: 'imported', id: importedId }
    const file = e.dataTransfer.files?.[0]
    if (file) return { kind: 'file', name: file.name }
    const text = e.dataTransfer.getData('text/plain')
    if (text && /\.(wav|mp3|aiff?|flac)$/i.test(text)) {
      return { kind: 'file', name: text.split('/').pop() ?? text }
    }
    return null
  }

  const laneTimeFromEvent = (e: React.DragEvent): number => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return Math.max(0, (e.clientX - rect.left) / pxPerSec)
  }

  const dispatchPayload = (payload: ReturnType<typeof readPayload>, trackId: string | null, atSec: number) => {
    if (!payload) return
    if (payload.kind === 'beat') {
      onDropBeat(payload.id)
      return
    }
    if (payload.kind === 'file') {
      onDropFile(payload.name, trackId, atSec)
      return
    }
    onDropImported(payload.id, trackId, atSec)
  }

  const rulerBars = Math.max(1, Math.ceil(contentSec / ((perBar * 60) / Math.max(1, project.bpm))))

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-auto">
      <div className="relative" style={{ width: TRACK_HEADER_W + contentPx, minWidth: '100%' }}>
        {/* header row: + Add Track and snap/zoom on the left, ruler on the right */}
        <div
          style={{ height: RULER_H }}
          className="sticky top-0 z-30 flex border-b border-white/10 bg-background"
        >
          <div
            style={{ width: TRACK_HEADER_W }}
            className="sticky left-0 z-40 flex flex-none items-center gap-2 border-r border-white/10 bg-background px-3"
          >
            <button
              onClick={onAddTrack}
              className="flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-black text-muted-foreground hover:text-lime-300"
            >
              <Plus size={15} />
              Add Track
            </button>
            <button
              onClick={onToggleSnap}
              aria-pressed={project.snap}
              title={project.snap ? 'Snap to grid: on' : 'Snap to grid: off'}
              className={`grid size-6 place-items-center rounded ${
                project.snap ? 'text-lime-300' : 'text-muted-foreground'
              } hover:bg-white/10`}
            >
              {project.snap ? <Magnet size={14} /> : <Grid3x3 size={14} />}
            </button>
            <div className="ml-auto flex items-center">
              <button
                onClick={() => onZoom(Math.max(0.25, zoom / 2))}
                aria-label="Zoom out"
                className="grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground"
              >
                <Minus size={13} />
              </button>
              <span className="w-8 text-center text-[9px] font-black tabular-nums text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => onZoom(Math.min(8, zoom * 2))}
                aria-label="Zoom in"
                className="grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground"
              >
                <Plus size={13} />
              </button>
            </div>
          </div>

          {/* ruler */}
          <div className="relative flex-none" style={{ width: contentPx }}>
            {Array.from({ length: rulerBars }, (_, i) => {
              const labelEvery = barPx >= 64 ? 1 : barPx >= 30 ? 4 : 8
              return (
                <div
                  key={i}
                  className="absolute top-0 h-full border-l border-white/15"
                  style={{ left: i * barPx }}
                >
                  {i % labelEvery === 0 && (
                    <span className="pl-1.5 text-[9px] font-black tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                  )}
                </div>
              )
            })}
            <span
              className="absolute top-0 z-10 size-2.5 -translate-x-1/2 rotate-45 rounded-[2px] bg-lime-300"
              style={{ left: playhead * pxPerSec }}
            />
          </div>

          {note && (
            <div className="absolute right-4 top-1 z-20 max-w-[28rem] truncate">
              <span
                className={`rounded-lg px-3 py-1 text-xs font-bold ${
                  note.kind === 'error' ? 'bg-rose-500/15 text-rose-300' : 'bg-lime-300/10 text-lime-300'
                }`}
              >
                {note.text}
              </span>
            </div>
          )}
        </div>

        {/* one row per track: header (sticky left) + lane scroll together */}
        {project.tracks.map(track => {
          const colorClass = CLIP_COLORS[track.colorIndex % CLIP_COLORS.length]
          const selected = selectedTrackId === track.id
          return (
            <div
              key={track.id}
              style={{ height: LANE_H }}
              className={`relative flex border-b ${
                selected ? 'border-lime-300/25' : 'border-white/[.06]'
              }`}
              onPointerDown={() => onSelectTrack(track.id)}
            >
              <TrackHeader
                track={track}
                selected={selected}
                onPatchTrack={onPatchTrack}
                onArm={onArm}
                onRename={onRenameTrack}
                onDuplicate={onDuplicateTrack}
                onDelete={onDeleteTrack}
                onSetTrackColor={onSetTrackColor}
              />

              {/* lane */}
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  const atSec = laneTimeFromEvent(e)
                  dispatchPayload(readPayload(e), track.id, atSec)
                }}
                className={`relative flex-1 ${
                  track.kind === 'beat' ? 'bg-lime-300/[.03]' : 'bg-white/[.012]'
                } ${transport === 'recording' && track.armed ? 'ring-1 ring-inset ring-rose-500/50' : ''}`}
              >
                {/* vertical grid that matches the ruler bars */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage: showBeatLines
                      ? `repeating-linear-gradient(to right, rgba(255,255,255,.09) 0 1px, transparent 1px ${barPx}px), repeating-linear-gradient(to right, rgba(255,255,255,.035) 0 1px, transparent 1px ${beatPx}px)`
                      : `repeating-linear-gradient(to right, rgba(255,255,255,.09) 0 1px, transparent 1px ${barPx}px)`,
                  }}
                />

                {track.clips.map(clip => {
                  const width = Math.max(10, clip.durationSec * pxPerSec)
                  const trimmed = clip.offsetSec > 0.01
                  return (
                    <div
                      key={clip.id}
                      role="button"
                      aria-label={`Clip ${clip.name}`}
                      onPointerDown={e => grab('move', e, track.id, clip)}
                      className={`group absolute top-1.5 z-10 flex cursor-grab flex-col overflow-hidden rounded-lg border border-white/25 shadow-md active:cursor-grabbing ${colorClass}`}
                      style={{ left: clip.startSec * pxPerSec, width, height: LANE_H - 12 }}
                    >
                      <div
                        onPointerDown={e => grab('trim-start', e, track.id, clip)}
                        className="absolute inset-y-0 left-0 z-10 w-2.5 cursor-ew-resize bg-white/10 opacity-0 transition group-hover:opacity-100"
                        aria-label="Trim clip start"
                      />
                      <div
                        onPointerDown={e => grab('trim-end', e, track.id, clip)}
                        className="absolute inset-y-0 right-0 z-10 w-2.5 cursor-ew-resize bg-white/10 opacity-0 transition group-hover:opacity-100"
                        aria-label="Trim clip end"
                      />

                      <div className="pointer-events-none flex items-center gap-1 px-2 pt-1">
                        <span className="truncate text-[10px] font-black">{clip.name}</span>
                        {trimmed && (
                          <span className="ml-auto shrink-0 rounded bg-black/25 px-1 text-[8px] font-black uppercase text-white/70">
                            trimmed
                          </span>
                        )}
                      </div>

                      {/* placeholder waveform — generated bars, no audio */}
                      <svg
                        className="mt-auto h-[64%] w-full"
                        viewBox={`0 0 ${clip.peaks.length} 100`}
                        preserveAspectRatio="none"
                        aria-hidden
                      >
                        {clip.peaks.map((p, i) => (
                          <rect
                            key={`${clip.id}-${i}`}
                            x={i + 0.2}
                            width={0.6}
                            y={50 - p * 44}
                            height={p * 88}
                            rx="0.3"
                            fill="rgba(0,0,0,.45)"
                          />
                        ))}
                      </svg>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* full-width drop zone below the last track */}
        <div
          style={{ height: 88 }}
          className="flex border-b border-transparent"
          onPointerDown={() => {}}
        >
          <div
            style={{ width: TRACK_HEADER_W }}
            className="sticky left-0 z-20 flex-none border-r border-white/[.06] bg-background"
          />
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault()
              e.stopPropagation()
              dispatchPayload(readPayload(e), null, laneTimeFromEvent(e))
            }}
            className="m-3 flex flex-1 items-center justify-center rounded-xl border border-dashed border-white/15"
          >
            <span className="text-xs font-black text-muted-foreground/60">
              Drop an audio file here to add a track
            </span>
          </div>
        </div>

        {/* playhead: one line across every lane, drawn after the rows so it
            overlays all of them; starts below the ruler and never covers the
            sticky header column (left offset includes the header width) */}
        <div
          className="pointer-events-none absolute z-40 w-[2px] bg-lime-300"
          style={{ top: RULER_H, bottom: 0, left: TRACK_HEADER_W + playhead * pxPerSec }}
        />
      </div>
    </div>
  )
}

// ---- track header ---------------------------------------------------------

function TrackHeader({
  track,
  selected,
  onPatchTrack,
  onArm,
  onRename,
  onDuplicate,
  onDelete,
  onSetTrackColor,
}: {
  track: StudioTrack
  selected: boolean
  onPatchTrack: (trackId: string, updater: (t: StudioTrack) => StudioTrack) => void
  onArm: (trackId: string) => void
  onRename: (trackId: string, name: string) => void
  onDuplicate: (trackId: string) => void
  onDelete: (trackId: string) => void
  onSetTrackColor: (trackId: string, colorIndex: number) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(track.name)
  const isAudio = track.kind === 'audio'

  const commitRename = () => {
    setRenaming(false)
    const next = draft.trim()
    if (next && next !== track.name) onRename(track.id, next)
    else setDraft(track.name)
  }

  return (
    <div
      style={{ width: TRACK_HEADER_W }}
      className={`group sticky left-0 z-20 flex flex-none border-r border-white/10 bg-background ${
        selected ? 'shadow-[inset_0_0_0_1px_rgba(163,230,53,.2)]' : ''
      }`}
    >
      {/* track color strip */}
      <div
        style={{ width: 4 }}
        className={`h-full flex-none ${STRIP_COLORS[track.colorIndex % STRIP_COLORS.length]} ${
          selected ? '' : 'opacity-60'
        }`}
      />

      {/* M / S rail */}
      <div className="flex w-7 flex-none flex-col items-center justify-center gap-1">
        <button
          onClick={() => onPatchTrack(track.id, t => ({ ...t, muted: !t.muted }))}
          aria-label={`Mute ${track.name}`}
          aria-pressed={track.muted}
          className={`size-6 rounded text-[10px] font-black ${
            track.muted ? 'bg-amber-400 text-black' : 'bg-white/[.07] text-muted-foreground hover:text-foreground'
          }`}
        >
          M
        </button>
        <button
          onClick={() => onPatchTrack(track.id, t => ({ ...t, soloed: !t.soloed }))}
          aria-label={`Solo ${track.name}`}
          aria-pressed={track.soloed}
          className={`size-6 rounded text-[10px] font-black ${
            track.soloed ? 'bg-lime-300 text-black' : 'bg-white/[.07] text-muted-foreground hover:text-foreground'
          }`}
        >
          S
        </button>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-2.5">
        {/* icon + name + menu */}
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`grid size-5 shrink-0 place-items-center rounded ${
              track.kind === 'beat' ? 'bg-lime-300/20 text-lime-300' : 'bg-sky-400/15 text-sky-300'
            }`}
          >
            {track.kind === 'beat' ? <Bus size={12} /> : <Mic size={12} />}
          </span>
          {renaming ? (
            <input
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') {
                  setDraft(track.name)
                  setRenaming(false)
                }
              }}
              className="min-w-0 flex-1 rounded border border-lime-300/60 bg-white/[.06] px-1.5 py-0.5 text-xs font-black outline-none"
              autoFocus
            />
          ) : (
            <span
              className="min-w-0 flex-1 cursor-text truncate text-xs font-black"
              onDoubleClick={() => setRenaming(true)}
              title="Double-click to rename"
            >
              {track.name}
              {track.armed && <span className="ml-1.5 inline-block size-2 rounded-full bg-rose-500" />}
            </span>
          )}
        </div>

        {/* volume + pan (+ arm for audio tracks) */}
        <div className="flex items-center gap-2">
          {isAudio && (
            <button
              onClick={() => onArm(track.id)}
              aria-label={`Record-arm ${track.name}`}
              aria-pressed={track.armed}
              title="Record-arm"
              className={`size-6 shrink-0 rounded text-[10px] font-black ${
                track.armed ? 'bg-rose-500 text-white' : 'bg-white/[.07] text-muted-foreground hover:text-white'
              }`}
            >
              ●
            </button>
          )}
          <input
            type="range"
            min={0}
            max={100}
            value={track.volume}
            onChange={e => onPatchTrack(track.id, t => ({ ...t, volume: Number(e.target.value) }))}
            aria-label={`Volume for ${track.name}`}
            className="h-1 min-w-0 flex-1 accent-lime-300"
          />
          <span
            className="relative grid size-7 shrink-0 place-items-center rounded-full border border-white/15 bg-white/[.04]"
            title={`Pan ${track.pan === 0 ? 'center' : track.pan > 0 ? `right ${track.pan}` : `left ${Math.abs(track.pan)}`}`}
          >
            <span
              className="absolute size-1 rounded-full bg-sky-300"
              style={{ transform: `rotate(${(track.pan / 100) * 135}deg) translateY(-9px)` }}
            />
          </span>
          <input
            type="range"
            min={-100}
            max={100}
            value={track.pan}
            onChange={e => onPatchTrack(track.id, t => ({ ...t, pan: Number(e.target.value) }))}
            aria-label={`Pan for ${track.name}`}
            className="h-1 w-14 shrink-0 accent-sky-300"
          />
        </div>
      </div>

      {/* ··· menu */}
      <div className="relative flex flex-none items-center pr-2">
        <button
          onClick={() => setMenuOpen(v => !v)}
          aria-label={`Track menu for ${track.name}`}
          className={`grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground ${
            menuOpen ? 'bg-white/10 text-foreground' : ''
          }`}
        >
          <MoreHorizontal size={15} />
        </button>

        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setMenuOpen(false)}
              onPointerDown={e => e.stopPropagation()}
            />
            <div className="absolute right-1 top-8 z-40 w-56 rounded-2xl border border-white/10 bg-[#161616] p-1.5 shadow-2xl">
              <MenuItem
                icon={<Pencil size={13} />}
                label="Rename"
                onClick={() => {
                  setDraft(track.name)
                  setRenaming(true)
                  setMenuOpen(false)
                }}
              />
              <MenuItem
                icon={<Copy size={13} />}
                label="Duplicate"
                disabled={!isAudio}
                hint={!isAudio ? 'Audio tracks only' : undefined}
                onClick={() => {
                  onDuplicate(track.id)
                  setMenuOpen(false)
                }}
              />
              {/* Change color: a div row so the swatch <button>s are never
                  nested inside a <button> (invalid HTML + hydration error) */}
              <div
                className="flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-xs font-bold text-foreground"
                title="Change color"
              >
                <span className="flex items-center gap-2">
                  <Palette size={13} />
                  Change color
                </span>
                <div className="flex gap-1">
                  {CLIP_COLORS.map((c, i) => (
                    <button
                      key={i}
                      onClick={e => {
                        e.stopPropagation()
                        onSetTrackColor(track.id, i)
                        setMenuOpen(false)
                      }}
                      aria-label={`Color ${i + 1}`}
                      className={`size-4 rounded-full ${c.split(' ')[0]} ${
                        track.colorIndex === i ? 'ring-2 ring-white/70' : ''
                      }`}
                    />
                  ))}
                </div>
              </div>

              {isAudio && (
                <div className="mt-1 border-t border-white/10 px-2.5 pb-1 pt-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Input
                    <select
                      value={track.inputId ?? 'none'}
                      onChange={e => {
                        onPatchTrack(track.id, t => ({ ...t, inputId: e.target.value }))
                      }}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-white/[.05] px-2 py-1.5 text-xs font-bold outline-none focus:border-lime-300/60 [&>option]:bg-[#161616]"
                    >
                      {MOCK_INPUTS.map(input => (
                        <option key={input.id} value={input.id}>
                          {input.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              <MenuItem
                icon={<Trash2 size={13} />}
                label="Delete track"
                disabled={!isAudio}
                hint={!isAudio ? 'The beat track is always first' : undefined}
                danger
                onClick={() => {
                  onDelete(track.id)
                  setMenuOpen(false)
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  hint,
  danger,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  hint?: string
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-bold ${
        disabled ? 'cursor-not-allowed text-muted-foreground/40' : danger ? 'text-rose-300 hover:bg-rose-500/10' : 'text-foreground hover:bg-white/5'
      }`}
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      {hint ? <span className="text-[9px] text-muted-foreground/50" /> : null}
    </button>
  )
}
