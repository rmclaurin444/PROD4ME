'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircleAlert, MonitorX } from 'lucide-react'
import type { PurchaseMode } from '@/components/app/purchase-modal'
import { PurchaseModal } from '@/components/app/purchase-modal'
import type { ShapedBeat } from '@/lib/beats'
import type {
  AudioEngineAdapter,
  SaveStatus,
  StudioBeat,
  StudioClip,
  StudioProject,
  StudioTrack,
  StudioUser,
  TransportState,
} from '@/lib/studio/types'
import {
  BASE_PX_PER_SEC,
  DEMO_IMPORTED_AUDIO,
  duplicateTrack,
  makeAudioTrack,
  makeBeatClip,
  makeClip,
  snapTime,
} from '@/lib/studio/mock-data'
import { useMinViewport } from '@/components/studio/use-min-viewport'
import { StudioChrome } from '@/components/studio/studio-home'
import { TopBar } from '@/components/studio/top-bar'
import { TransportBar } from '@/components/studio/transport-bar'
import { LibraryPanel } from '@/components/studio/library-panel'
import { TrackArea } from '@/components/studio/track-area'
import { BottomPanel } from '@/components/studio/bottom-panel'
import { ExportLockedModal } from '@/components/studio/export-locked-modal'

// The mock UI drives its own clock; when a real engine lands it will be
// injected here and take over the playhead/transport right away.
const ENGINE: AudioEngineAdapter | null = null

export function Workspace({
  user,
  project,
  catalog,
  saveStatus,
  onPatch,
  onBack,
  onBeatLicensed,
}: {
  user: StudioUser
  project: StudioProject
  catalog: StudioBeat[]
  saveStatus: SaveStatus
  onPatch: (updater: (p: StudioProject) => StudioProject, opts?: { markEdit?: boolean }) => void
  onBack: () => void
  onBeatLicensed: (beatId: string) => void
}) {
  const isDesktop = useMinViewport(768)

  const [transport, setTransport] = useState<TransportState>('stopped')
  const [playhead, setPlayhead] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [libraryOpen, setLibraryOpen] = useState(true)
  const [bottomTab, setBottomTab] = useState<'mixer' | 'effects'>('mixer')
  const [selectedTrackId, setSelectedTrackId] = useState('track-beat')
  const [note, setNote] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)
  const [armPrompt, setArmPrompt] = useState(false)
  const [exportLockedOpen, setExportLockedOpen] = useState(false)
  const [purchase, setPurchase] = useState<{ mode: PurchaseMode } | null>(null)

  const beat = project.beatId ? catalog.find(b => b.id === project.beatId) ?? null : null
  const armedTrack = project.tracks.find(t => t.kind === 'audio' && t.armed) ?? null
  const pxPerSec = BASE_PX_PER_SEC * zoom

  const loopEnd = useMemo(() => {
    let last = 0
    for (const t of project.tracks) for (const c of t.clips) last = Math.max(last, c.startSec + c.durationSec)
    return Math.max(last, loopDefaultEnd)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project])

  // ---- project editing helpers ---------------------------------------------

  const patchTrack = useCallback(
    (trackId: string, updater: (t: StudioTrack) => StudioTrack) => {
      onPatch(p => ({ ...p, tracks: p.tracks.map(t => (t.id === trackId ? updater(t) : t)) }))
    },
    [onPatch]
  )

  const patchClip = useCallback(
    (trackId: string, clipId: string, updater: (c: StudioClip) => StudioClip) => {
      onPatch(p => ({
        ...p,
        tracks: p.tracks.map(t =>
          t.id === trackId
            ? { ...t, clips: t.clips.map(c => (c.id === clipId ? updater(c) : c)) }
            : t
        ),
      }))
    },
    [onPatch]
  )

  const armTrack = useCallback(
    (trackId: string) => {
      onPatch(p => ({
        ...p,
        tracks: p.tracks.map(t =>
          t.kind === 'audio'
            ? t.id === trackId
              ? { ...t, armed: !t.armed }
              : { ...t, armed: false }
            : t
        ),
      }))
      setArmPrompt(false)
    },
    [onPatch]
  )

  const addTrack = useCallback(() => {
    onPatch(p => ({ ...p, tracks: [...p.tracks, makeAudioTrack()] }))
  }, [onPatch])

  // ---- track menu operations (header ··· menu) -------------------------------

  const renameTrack = useCallback(
    (trackId: string, name: string) => patchTrack(trackId, t => ({ ...t, name })),
    [patchTrack]
  )

  const duplicateTrackById = useCallback(
    (trackId: string) => {
      onPatch(p => {
        const index = p.tracks.findIndex(t => t.id === trackId)
        const source = p.tracks[index]
        if (!source) return p
        const copy = duplicateTrack(source)
        const tracks = [...p.tracks]
        tracks.splice(index + 1, 0, copy)
        return { ...p, tracks }
      })
      setSelectedTrackId(trackId) // selection follows the new row visually
    },
    [onPatch]
  )

  const deleteTrack = useCallback(
    (trackId: string) => {
      onPatch(p => {
        const target = p.tracks.find(t => t.id === trackId)
        // the beat track is pinned and never deletable
        if (!target || target.kind === 'beat') return p
        return { ...p, tracks: p.tracks.filter(t => t.id !== trackId) }
      })
      if (selectedTrackId === trackId) setSelectedTrackId('track-beat')
    },
    [onPatch, selectedTrackId]
  )

  const setTrackColor = useCallback(
    (trackId: string, colorIndex: number) => patchTrack(trackId, t => ({ ...t, colorIndex })),
    [patchTrack]
  )

  const loadBeat = useCallback(
    (beatId: string) => {
      const b = catalog.find(x => x.id === beatId)
      if (!b) return
      // Trial beats load their tagged preview only — the clean URL is never
      // referenced while access is 'trial'.
      onPatch(p => ({
        ...p,
        beatId: b.id,
        bpm: b.bpm ?? p.bpm,
        musicalKey: b.musicalKey ?? p.musicalKey,
        tracks: p.tracks.map(t =>
          t.kind === 'beat' ? { ...t, clips: [makeBeatClip(b)] } : t
        ),
      }))
      setNote({ kind: 'info', text: `${b.title} loaded into the beat track.` })
    },
    [catalog, onPatch]
  )

  const placeClip = useCallback(
    (clip: StudioClip, trackId: string | null) => {
      onPatch(p => {
        if (trackId) {
          return {
            ...p,
            tracks: p.tracks.map(t => (t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t)),
          }
        }
        // empty timeline space → brand new track holding the clip
        const track = { ...makeAudioTrack('From import'), clips: [clip] }
        return { ...p, tracks: [...p.tracks, track] }
      })
    },
    [onPatch]
  )

  const dropFile = useCallback(
    (fileName: string, trackId: string | null, atSec: number) => {
      const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
      if (!['wav', 'mp3', 'aiff', 'flac'].includes(ext)) {
        setNote({
          kind: 'error',
          text: `“${fileName}” isn’t supported. Drop a WAV, MP3, AIFF, or FLAC file.`,
        })
        return
      }
      const clip = makeClip({
        name: fileName.replace(/\.[^.]+$/, ''),
        startSec: snapTime(atSec, project.snap, project.bpm),
        color: 1,
        source: 'file',
      })
      placeClip(clip, trackId)
      setNote({ kind: 'info', text: `${clip.name} added${trackId ? '' : ' on a new track'}.` })
    },
    [project.snap, project.bpm, placeClip]
  )

  const dropImported = useCallback(
    (itemId: string, trackId: string | null, atSec: number) => {
      const item = DEMO_IMPORTED_AUDIO.find(i => i.id === itemId)
      if (!item) return
      const clip = makeClip({
        name: item.name,
        startSec: snapTime(atSec, project.snap, project.bpm),
        durationSec: item.durationSec,
        color: 2,
        source: 'library',
      })
      placeClip(clip, trackId)
    },
    [project.snap, project.bpm, placeClip]
  )

  // ---- transport ------------------------------------------------------------

  const playheadRef = useRef(0)
  playheadRef.current = playhead
  const recordingClipRef = useRef<string | null>(null)
  const startRef = useRef(0) // playhead position when the current take started
  const recordedRef = useRef(0) // last applied clip duration (throttle watermark)
  const lastBeatTickRef = useRef(-1)
  const [metronomeTick, setMetronomeTick] = useState(0)

  const togglePlay = useCallback(() => {
    setTransport(t => (t === 'playing' || t === 'recording' ? 'paused' : 'playing'))
  }, [])

  const stop = useCallback(() => {
    const wasRecording = transport === 'recording'
    setTransport('stopped')
    if (!wasRecording) setPlayhead(0)
    if (wasRecording) {
      recordingClipRef.current = null
      setNote({ kind: 'info', text: 'Take captured on the armed track — mock capture only.' })
    }
  }, [transport])

  const toggleRecord = useCallback(() => {
    if (transport === 'recording') {
      recordingClipRef.current = null
      setTransport('stopped')
      setNote({ kind: 'info', text: 'Recording captured — UI only, nothing was recorded.' })
      return
    }
    const target = project.tracks.find(t => t.kind === 'audio' && t.armed)
    if (!target) {
      setArmPrompt(true)
      setNote({ kind: 'error', text: 'No track is armed. Click the red arm button on a track first.' })
      return
    }
    setArmPrompt(false)
    startRef.current = playheadRef.current
    recordedRef.current = 0
    const clip = makeClip({
      name: `Take — ${new Date().toLocaleTimeString()}`,
      startSec: playheadRef.current,
      durationSec: 0.1,
      color: 3,
      source: 'recording',
    })
    recordingClipRef.current = clip.id
    onPatch(p => ({
      ...p,
      tracks: p.tracks.map(t =>
        t.id === target.id ? { ...t, clips: [...t.clips, clip] } : t
      ),
    }))
    setTransport('recording')
  }, [transport, project.tracks, onPatch])

  // mock clock — replaces itself with a real audio engine via AudioEngineAdapter
  const projectRef = useRef(project)
  projectRef.current = project
  const loopEndRef = useRef(loopEnd)
  loopEndRef.current = loopEnd
  const armedTrackRef = useRef(armedTrack)
  armedTrackRef.current = armedTrack

  useEffect(() => {
    if (transport !== 'playing' && transport !== 'recording') return
    let raf = 0
    let last = performance.now()

    const tick = (now: number) => {
      const dt = Math.max(0, (now - last) / 1000)
      last = now
      const p = projectRef.current
      const per = 60 / Math.max(1, p.bpm)

      setPlayhead(ph => {
        let next = ph + dt
        if (p.loop && loopEndRef.current > 0 && next >= loopEndRef.current) {
          next = next % loopEndRef.current
        }
        return next
      })

      if (p.metronome) {
        const idx = Math.floor(playheadRef.current / per)
        if (idx !== lastBeatTickRef.current) {
          lastBeatTickRef.current = idx
          setMetronomeTick(idx)
        }
      }

      // Recording growth is applied on the armed track (ref-read each frame so
      // re-arming never re-schedules the clock) and throttled to ~10 updates
      // per second to keep the UI light.
      if (transport === 'recording' && ENGINE === null) {
        const target = armedTrackRef.current
        const clipId = recordingClipRef.current
        if (target && clipId) {
          const elapsed = Math.max(0.1, playheadRef.current - startRef.current)
          if (elapsed - recordedRef.current >= 0.1) {
            recordedRef.current = Math.floor(elapsed * 10) / 10
            onPatch(
              curr => ({
                ...curr,
                tracks: curr.tracks.map(t =>
                  t.id === target.id
                    ? {
                        ...t,
                        clips: t.clips.map(c =>
                          c.id === clipId ? { ...c, durationSec: recordedRef.current } : c
                        ),
                      }
                    : t
                ),
              }),
              { markEdit: false }
            )
          }
        }
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport])

  // gentle auto-dismiss for inline notes
  useEffect(() => {
    if (!note) return
    const t = window.setTimeout(() => setNote(null), 4500)
    return () => window.clearTimeout(t)
  }, [note])

  // ---- keyboard shortcuts -----------------------------------------------------

  const handlersRef = useRef({ togglePlay, toggleRecord })
  handlersRef.current = { togglePlay, toggleRecord }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (
        el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
      )
        return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.code === 'Space') {
        e.preventDefault()
        handlersRef.current.togglePlay()
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        handlersRef.current.toggleRecord()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---- export / purchase ------------------------------------------------------

  const canExport = beat !== null && beat.access !== 'trial'
  const onExport = useCallback(() => {
    if (canExport) {
      setNote({ kind: 'info', text: 'Export queued — demo build, no audio is rendered yet.' })
    } else {
      setExportLockedOpen(true)
    }
  }, [canExport])

  const purchaseBeat: ShapedBeat = useMemo(() => {
    if (!beat) return null as unknown as ShapedBeat
    const p = beat.purchase
    return {
      id: p?.id ?? beat.id,
      title: beat.title,
      producer: beat.producer,
      producerId: '',
      avatar: '',
      tags: [],
      bpm: beat.bpm,
      musicalKey: beat.musicalKey,
      price: p?.price ?? beat.price,
      exclusivePriceCents: p?.exclusivePriceCents ?? null,
      exclusiveSold: p?.exclusiveSold ?? false,
      licenseCount: 0,
      plays: 0,
      likes: 0,
      saves: 0,
      shares: 0,
      comments: 0,
      durationSec: beat.durationSec,
      artUrl: null,
      artPreset: null,
      peaks: null,
      audioUrl: beat.previewAudioUrl,
    }
  }, [beat])

  // ---- responsive gate ------------------------------------------------------

  if (!isDesktop) {
    return (
      <StudioChrome user={user}>
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-md rounded-3xl border border-white/10 bg-white/[.03] p-10 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/[.04] text-lime-300">
              <MonitorX size={26} />
            </div>
            <h2 className="mt-5 text-2xl font-black">Best on a larger screen</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              The Studio workspace is designed for desktop screens. Open PROD4ME on a screen at
              least 768px wide to record — you can still browse your projects from this device.
            </p>
            <button
              onClick={onBack}
              className="mt-6 rounded-xl bg-lime-300 px-5 py-3 text-sm font-black text-black hover:bg-lime-200"
            >
              Back to Studio Home
            </button>
          </div>
        </div>
      </StudioChrome>
    )
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <TopBar
        name={project.name}
        saveStatus={saveStatus}
        access={beat?.access ?? null}
        offerPending={beat?.offerPending ?? false}
        canExport={canExport}
        onBack={onBack}
        onRename={name => onPatch(p => ({ ...p, name }))}
        onExport={onExport}
      />

      {beat?.access === 'trial' && (
        <TrialBanner
          offerPending={beat.offerPending}
          isDemo={beat.isDemo}
          onBuy={() => setPurchase({ mode: 'buy' })}
          onOffer={() => setPurchase({ mode: 'offer' })}
        />
      )}

      {armPrompt && (
        <div className="flex items-center justify-between gap-4 border-b border-white/10 bg-rose-500/10 px-6 py-2 text-xs font-bold text-rose-200">
          <span>Record needs a destination: click the ● arm button on a track, then press R.</span>
          <button onClick={() => setArmPrompt(false)} className="font-black text-rose-300">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <LibraryPanel
          open={libraryOpen}
          onToggle={() => setLibraryOpen(v => !v)}
          beats={catalog}
          onBeatDoubleClick={loadBeat}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TransportBar
            transport={transport}
            playhead={playhead}
            bpm={project.bpm}
            musicalKey={project.musicalKey}
            timeSignature={project.timeSignature}
            metronome={project.metronome}
            metronomeTick={metronomeTick}
            loop={project.loop}
            onTogglePlay={togglePlay}
            onStop={stop}
            onToggleRecord={toggleRecord}
            onToggleLoop={() => onPatch(p => ({ ...p, loop: !p.loop }))}
            onToggleMetronome={() => onPatch(p => ({ ...p, metronome: !p.metronome }))}
            onSetBpm={bpm => onPatch(p => ({ ...p, bpm: Math.min(300, Math.max(40, bpm || 120)) }))}
            onSetKey={key => onPatch(p => ({ ...p, musicalKey: key }))}
            onSetTimeSignature={ts => onPatch(p => ({ ...p, timeSignature: ts }))}
          />

          <div className="min-h-0 flex-1 overflow-hidden">
            <TrackArea
              project={project}
              pxPerSec={pxPerSec}
              playhead={playhead}
              transport={transport}
              loopEnd={loopEnd}
              note={note}
              zoom={zoom}
              selectedTrackId={selectedTrackId}
              onZoom={setZoom}
              onSelectTrack={setSelectedTrackId}
              onToggleSnap={() => onPatch(p => ({ ...p, snap: !p.snap }))}
              onMoveClip={(trackId, clipId, startSec) =>
                patchClip(trackId, clipId, c => ({ ...c, startSec }))
              }
              onTrimClip={(trackId, clipId, startSec, durationSec, offsetSec) =>
                patchClip(trackId, clipId, c => ({ ...c, startSec, durationSec, offsetSec }))
              }
              onPatchTrack={patchTrack}
              onArm={armTrack}
              onAddTrack={addTrack}
              onRenameTrack={renameTrack}
              onDuplicateTrack={duplicateTrackById}
              onDeleteTrack={deleteTrack}
              onSetTrackColor={setTrackColor}
              onDropFile={dropFile}
              onDropImported={dropImported}
              onDropBeat={beatId => loadBeat(beatId)}
            />
          </div>

          <BottomPanel
            tab={bottomTab}
            onTab={setBottomTab}
            tracks={project.tracks}
            onPatchTrack={patchTrack}
          />
        </div>
      </div>

      {purchase && beat && (
        <PurchaseModal
          beat={purchaseBeat}
          mode={purchase.mode}
          owned={beat.access === 'licensed' ? ['NON_EXCLUSIVE' as const] : []}
          onClose={() => setPurchase(null)}
          onObtained={() => {
            setPurchase(null)
            onBeatLicensed(beat.id)
            setNote({ kind: 'info', text: 'License granted — Export unlocked for this project.' })
          }}
        />
      )}

      {exportLockedOpen && beat && (
        <ExportLockedModal
          access={beat.access}
          offerPending={beat.offerPending}
          beatTitle={beat.title}
          onClose={() => setExportLockedOpen(false)}
          onBuy={() => {
            setExportLockedOpen(false)
            setPurchase({ mode: 'buy' })
          }}
          onOffer={() => {
            setExportLockedOpen(false)
            setPurchase({ mode: 'offer' })
          }}
        />
      )}
    </div>
  )
}

const loopDefaultEnd = 8

function TrialBanner({
  offerPending,
  isDemo,
  onBuy,
  onOffer,
}: {
  offerPending: boolean
  isDemo: boolean
  onBuy: () => void
  onOffer: () => void
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-amber-400/20 bg-amber-400/[.07] px-6 py-2.5">
      <CircleAlert size={16} className="shrink-0 text-amber-300" />
      <p className="min-w-0 flex-1 text-xs font-bold text-amber-200">
        Trial mode: This beat includes a PROD4ME audio tag. License it to remove the tag and export
        your song.
        {offerPending && (
          <span className="mt-0.5 block text-[11px] font-semibold text-amber-200/80">
            Offer pending — the producer hasn’t responded yet. This project stays in trial mode
            until your license is granted.
          </span>
        )}
        {isDemo && (
          <span className="mt-0.5 block text-[11px] font-semibold text-amber-200/60">
            Demo beat — purchase actions are illustrative only.
          </span>
        )}
      </p>
      <button
        onClick={onBuy}
        className="shrink-0 rounded-lg bg-amber-300 px-4 py-1.5 text-xs font-black text-black hover:bg-amber-200"
      >
        Buy license
      </button>
      <button
        onClick={onOffer}
        className="shrink-0 rounded-lg border border-amber-300/50 px-4 py-1.5 text-xs font-black text-amber-200 hover:bg-amber-300/10"
      >
        Make offer
      </button>
    </div>
  )
}
