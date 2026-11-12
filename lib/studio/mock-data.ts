import type {
  StudioBeat,
  StudioClip,
  StudioEffectOption,
  StudioInputOption,
  StudioProject,
  StudioTrack,
} from './types'

// ---- constants -------------------------------------------------------------

/** Clip background palette (lime/emerald family matches the app theme). */
export const CLIP_COLORS = [
  'bg-lime-300/25 text-lime-200',
  'bg-emerald-500/20 text-emerald-200',
  'bg-teal-500/20 text-teal-200',
  'bg-amber-400/15 text-amber-200',
  'bg-rose-500/15 text-rose-200',
  'bg-sky-500/15 text-sky-200',
]

export const LANE_H = 104 // px height of one combined track row (header + lane)
export const TRACK_HEADER_W = 280 // px width of the sticky left header column
export const RULER_H = 36 // px height of the time ruler / header row
export const BASE_PX_PER_SEC = 40

export const SUPPORTED_UPLOAD_EXT = ['wav', 'mp3', 'aiff', 'flac'] as const

/** Mock duration given to clips created from dropped files. Real durations
 *  will come from decoding once audio is wired up. */
export const DROPPED_CLIP_SEC = 4

export const MOCK_INPUTS: StudioInputOption[] = [
  { id: 'none', label: 'No input' },
  { id: 'mic1', label: 'Mic 1 — Focusrite' },
  { id: 'mic2', label: 'Mic 2 — AT2020' },
  { id: 'line12', label: 'Line In 1/2' },
  { id: 'loopback', label: 'Stereo loopback' },
]

// Effects are display-only "Coming Soon" entries; slots stay empty until the
// real processing pipeline exists.
export const EFFECT_OPTIONS: (StudioEffectOption & { comingSoon: true })[] = [
  { id: 'autotune', label: 'Auto-Tune', comingSoon: true },
  { id: 'compressor', label: 'Compressor', comingSoon: true },
  { id: 'eq', label: 'EQ', comingSoon: true },
  { id: 'reverb', label: 'Reverb', comingSoon: true },
]

export const TIME_SIGNATURES = ['4/4', '3/4', '6/8', '5/4']

export const METRONOME_NOTE_SEC = 0.02 // visual metronome flash length

// ---- small helpers ---------------------------------------------------------

export function beatsPerBar(timeSignature: string): number {
  const top = Number(timeSignature.split('/')[0])
  return Number.isFinite(top) && top > 0 ? top : 4
}

export function beatSec(bpm: number): number {
  return 60 / Math.max(1, bpm)
}

export function formatTimecode(sec: number): string {
  const s = Math.max(0, sec)
  const m = Math.floor(s / 60)
  const rest = s - m * 60
  return `${String(m).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}`
}

export function formatBarBeat(sec: number, bpm: number, timeSignature: string): string {
  const beats = Math.max(0, sec) * beatSec(bpm)
  const bar = Math.floor(beats / beatsPerBar(timeSignature)) + 1
  const beat = Math.floor(beats % beatsPerBar(timeSignature)) + 1
  return `${bar}.${beat}`
}

export function snapTime(sec: number, enabled: boolean, bpm: number): number {
  if (!enabled) return Math.max(0, sec)
  const step = beatSec(bpm)
  return Math.max(0, Math.round(sec / step) * step)
}

/** Deterministic pseudo-waveform for placeholder clips (no audio decoding). */
export function generatePeaks(seed: string, bars = 64): number[] {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const out: number[] = []
  for (let i = 0; i < bars; i++) {
    h = (h * 1664525 + 1013904223) >>> 0
    const v = ((h >>> 8) % 1000) / 1000
    // shape: louder in the middle, quieter at the edges
    const env = Math.sin((i / bars) * Math.PI) * 0.7 + 0.3
    out.push(Math.max(0.08, v * env))
  }
  return out
}

export function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function isSupportedAudioFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return (SUPPORTED_UPLOAD_EXT as readonly string[]).includes(ext)
}

// ---- factories -------------------------------------------------------------

export function makeBeatTrack(beat: StudioBeat | null): StudioTrack {
  return {
    id: 'track-beat',
    kind: 'beat',
    name: 'Beat',
    colorIndex: 0,
    muted: false,
    soloed: false,
    volume: 85,
    pan: 0,
    armed: false,
    inputId: null,
    effectSlots: emptyEffectSlots(),
    clips: beat ? [makeBeatClip(beat)] : [],
  }
}

export function makeBeatClip(beat: StudioBeat): StudioClip {
  return {
    id: 'clip-beat',
    name: beat.title,
    startSec: 0,
    durationSec: beat.durationSec,
    offsetSec: 0,
    color: 0,
    peaks: generatePeaks(`beat-${beat.id}`),
    source: 'beat',
    audioUrl: beat.previewAudioUrl,
  }
}

export function emptyEffectSlots(): StudioTrack['effectSlots'] {
  return [1, 2, 3, 4].map(slot => ({ slot, effectId: null }))
}

let trackCounter = 0
export function makeAudioTrack(name?: string, colorIndex?: number): StudioTrack {
  trackCounter += 1
  return {
    id: `track-${Date.now()}-${trackCounter}`,
    kind: 'audio',
    name: name ?? `Audio ${trackCounter}`,
    colorIndex: colorIndex ?? 1 + (trackCounter % (CLIP_COLORS.length - 1)),
    muted: false,
    soloed: false,
    volume: 80,
    pan: 0,
    armed: false,
    inputId: 'none',
    clips: [],
    effectSlots: emptyEffectSlots(),
  }
}

/** Clone for the header ··· menu. Clips come along; the copy gets its own id,
 *  name suffix and the next palette color. */
export function duplicateTrack(track: StudioTrack): StudioTrack {
  trackCounter += 1
  const copy: StudioTrack = {
    ...track,
    id: `track-${Date.now()}-${trackCounter}`,
    name: `${track.name} Copy`,
    colorIndex: 1 + (trackCounter % (CLIP_COLORS.length - 1)),
    armed: false,
    clips: track.clips.map(c => ({ ...c, id: `clip-${Date.now()}-${trackCounter}-${c.id}`, peaks: [...c.peaks] })),
    effectSlots: emptyEffectSlots(),
  }
  return copy
}

export function makeClip(opts: {
  name: string
  startSec: number
  durationSec?: number
  color?: number
  source: StudioClip['source']
  audioUrl?: string | null
}): StudioClip {
  return {
    id: `clip-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    name: opts.name,
    startSec: opts.startSec,
    durationSec: opts.durationSec ?? DROPPED_CLIP_SEC,
    offsetSec: 0,
    color: opts.color ?? 1,
    peaks: generatePeaks(opts.name),
    source: opts.source,
    audioUrl: opts.audioUrl ?? null,
  }
}

// ---- demo beats (only used to guarantee that free / licensed / trial are
// all viewable when the artist's real catalog does not cover a state) -------

export function buildDemoBeats(): StudioBeat[] {
  return [
    {
      id: 'demo-beat-licensed',
      title: 'Golden Section',
      producer: 'Demo — licensed',
      bpm: 92,
      musicalKey: 'F minor',
      price: 29,
      access: 'licensed',
      offerPending: false,
      previewAudioUrl: '/demo-audio/golden-section.mp3',
      licensedAudioUrl: '/demo-audio/golden-section-clean.mp3',
      durationSec: 12,
      purchase: null,
      isDemo: true,
    },
    {
      id: 'demo-beat-free',
      title: 'Basement Chops',
      producer: 'Demo — free',
      bpm: 104,
      musicalKey: 'G minor',
      price: 0,
      access: 'free',
      offerPending: false,
      previewAudioUrl: '/demo-audio/basement-chops.mp3',
      licensedAudioUrl: '/demo-audio/basement-chops-clean.mp3',
      durationSec: 10,
      purchase: null,
      isDemo: true,
    },
    {
      id: 'demo-beat-trial',
      title: 'After Hours',
      producer: 'Demo — trial',
      bpm: 128,
      musicalKey: 'C minor',
      price: 35,
      access: 'trial',
      offerPending: false,
      previewAudioUrl: '/demo-audio/after-hours-tagged.mp3',
      licensedAudioUrl: null, // trial beats must never expose the clean URL
      durationSec: 15,
      purchase: null,
      isDemo: true,
    },
  ]
}

// ---- initial projects -------------------------------------------------------

let projectCounter = 0

export function createProject(name: string, beat: StudioBeat | null): StudioProject {
  projectCounter += 1
  return {
    id: `proj-${Date.now()}-${projectCounter}`,
    name,
    lastEditedAt: new Date().toISOString(),
    beatId: beat?.id ?? null,
    bpm: beat?.bpm ?? 120,
    musicalKey: beat?.musicalKey ?? 'C major',
    timeSignature: '4/4',
    metronome: false,
    loop: false,
    snap: true,
    tracks: [
      makeBeatTrack(beat),
      makeAudioTrack('Lead vox'),
      makeAudioTrack('Harmony'),
    ],
  }
}

/** Demo projects seeded on first load — one per access state present in the
 *  catalog, each with a beat track and at least two audio tracks. */
export function buildInitialProjects(catalog: StudioBeat[]): StudioProject[] {
  const byAccess = (access: StudioBeat['access']) =>
    catalog.find(b => b.access === access)

  const projects: StudioProject[] = []
  const trial = byAccess('trial')
  const licensed = byAccess('licensed')
  const free = byAccess('free')

  if (trial) {
    const p = createProject('Night Drive — take 2', trial)
    p.tracks[1].clips = [makeClip({ name: 'Lead vox — take 1', startSec: 0, durationSec: 6, color: 1, source: 'recording' })]
    p.tracks[2].clips = [makeClip({ name: 'Harmony — hook', startSec: 2, durationSec: 4, color: 2, source: 'recording' })]
    projects.push(p)
  }
  if (licensed) {
    const p = createProject('First Light — vocal comp', licensed)
    p.tracks[1].clips = [makeClip({ name: 'Verse — lead', startSec: 0.5, durationSec: 5, color: 1, source: 'recording' })]
    projects.push(p)
  }
  if (free) {
    const p = createProject('Sunday cypher', free)
    p.tracks[1].clips = [makeClip({ name: 'Freestyle — take 3', startSec: 1, durationSec: 4, color: 4, source: 'recording' })]
    projects.push(p)
  }

  return projects
}

/** Imported audio shown in the Library panel; draggable onto any lane. */
export type LibraryImportedItem = {
  id: string
  name: string
  durationSec: number
}

export const DEMO_IMPORTED_AUDIO: LibraryImportedItem[] = [
  { id: 'imp-1', name: 'adlibs-packed-0812', durationSec: 3 },
  { id: 'imp-2', name: 'room-tone-future', durationSec: 5 },
  { id: 'imp-3', name: 'double-vocal-stem', durationSec: 4 },
  { id: 'imp-4', name: 'whistle-take-f', durationSec: 2.5 },
]
