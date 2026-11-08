// Studio is a browser recording workspace UI built on typed mock data.
// Nothing here touches live audio — the shapes below are intentionally
// designed so a real audio engine can replace the mock clock later without
// redesigning the UI (see `AudioEngineAdapter`).

export type BeatAccess = 'free' | 'licensed' | 'trial'

/** One beat as seen inside Studio. The clean (licensed) audio URL is only
 *  present for free/licensed access — a trial beat must only ever reference
 *  `previewAudioUrl`, so a license grant fills `licensedAudioUrl` later and
 *  the tagged preview stays untouched. Tag settings themselves live in the
 *  developer panel (out of scope here). */
export type StudioBeat = {
  id: string
  title: string
  producer: string
  bpm: number | null
  musicalKey: string | null
  price: number
  access: BeatAccess
  offerPending: boolean
  previewAudioUrl: string
  licensedAudioUrl: string | null
  durationSec: number
  /** Present only when this entry maps to a real PROD4ME beat row, so the
   *  workspace can hand it to the existing purchase/offer flows as-is. */
  purchase: {
    id: string
    title: string
    price: number
    exclusivePriceCents: number | null
    exclusiveSold: boolean
  } | null
  isDemo: boolean
}

export type TrackKind = 'beat' | 'audio'

export type StudioEffectSlot = {
  /** 1-based insert index, always four slots per track. */
  slot: number
  /** Reserved for future effect instances; stays null today. */
  effectId: string | null
}

export type StudioClip = {
  id: string
  name: string
  startSec: number
  durationSec: number
  /** Source offset used when the clip is trimmed from the left edge. */
  offsetSec: number
  /** Palette index for the clip background. */
  color: number
  /** Placeholder waveform bars — generated, never decoded audio. */
  peaks: number[]
  source: 'beat' | 'file' | 'library' | 'recording'
  /** Preview URL for reference only; the mock UI never plays audio. */
  audioUrl: string | null
}

export type StudioTrack = {
  id: string
  kind: TrackKind
  name: string
  /** Index into CLIP_COLORS — drives the header color strip and clip styling. */
  colorIndex: number
  muted: boolean
  soloed: boolean
  /** 0..100 */
  volume: number
  /** -100..100 (left..right) */
  pan: number
  /** Record-arm only applies to audio tracks. */
  armed: boolean
  inputId: string | null
  clips: StudioClip[]
  effectSlots: StudioEffectSlot[]
}

export type StudioProject = {
  id: string
  name: string
  lastEditedAt: string
  beatId: string | null
  bpm: number
  musicalKey: string
  timeSignature: string
  metronome: boolean
  loop: boolean
  snap: boolean
  /** tracks[0] is always the pinned beat track. */
  tracks: StudioTrack[]
}

export type SaveStatus = 'saved' | 'saving' | 'unsaved'

export type TransportState = 'stopped' | 'playing' | 'paused' | 'recording'

export type StudioUser = {
  id: string
  name: string
}

/** Placeholder seam for a future audio engine. The workspace treats a null
 *  adapter as "mock clock mode" (a UI-only playhead); when an engine lands,
 *  it plugs in here without touching component state shape. */
export type AudioEngineAdapter = {
  play(fromSec: number): void
  pause(): void
  stop(): void
  /** Returns a handle the engine cancels with. */
  startRecording(trackId: string, atSec: number): void
  stopRecording(): void
}

export type StudioInputOption = {
  id: string
  label: string
}

export type StudioEffectOption = {
  id: string
  label: string
}
