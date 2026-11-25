import type { EventTypeName } from './constants'

/**
 * Client-side, fire-and-forget engagement tracking. Every call is
 * non-blocking: it never awaits, never throws, and failures are swallowed so
 * recommendation telemetry can never interrupt playback or any other UI.
 *
 * Server decides all validation (auth, event type, duplicates) — the client
 * just reports what it observed. `metadata` (Prompt 13) tags the event with
 * the feed it happened in so analytics can split For You vs Following later.
 */

const EVENTS_API_PATH = '/api/events'

export type TrackMetadata = { feed?: 'foryou' | 'following' }

export function trackEvent(beatId: string, type: EventTypeName, metadata?: TrackMetadata): void {
  if (typeof fetch === 'undefined') return
  void fetch(EVENTS_API_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata ? { beatId, type, metadata } : { beatId, type }),
    // keepalive lets pages during navigation/unload still deliver the event
    keepalive: true,
  }).catch(() => {
    // never let telemetry failures affect the UI
  })
}
