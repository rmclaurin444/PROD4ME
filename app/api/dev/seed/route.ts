import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { devPanelEnabled, devDatasetStats, purgeDevDataset, seedDevDataset } from '@/lib/dev-seed'

/** Dev panel routes exist only outside production (or with DEV_PANEL=1). */
function guard(): NextResponse | null {
  if (!devPanelEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return null
}

/** Current dev dataset stats for the panel overview. */
export async function GET() {
  const blocked = guard()
  if (blocked) return blocked
  return NextResponse.json(await devDatasetStats())
}

/** Run the mass dataset seeder. */
export async function POST(request: Request) {
  const blocked = guard()
  if (blocked) return blocked

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    beats?: number
    producers?: number
    artists?: number
    genres?: string[]
    eventsPerUser?: number
    seed?: number
    audioDir?: string | null
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const clamp = (value: unknown, min: number, max: number, fallback: number) => {
    const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback
    return Math.min(max, Math.max(min, n))
  }

  try {
    const summary = await seedDevDataset({
      beats: clamp(body.beats, 1, 2000, 200),
      producers: clamp(body.producers, 1, 50, 8),
      artists: clamp(body.artists, 1, 100, 10),
      genres: Array.isArray(body.genres)
        ? body.genres.filter((g): g is string => typeof g === 'string').slice(0, 24)
        : [],
      eventsPerUser: clamp(body.eventsPerUser, 0, 500, 40),
      seed: typeof body.seed === 'number' && Number.isFinite(body.seed) ? body.seed : undefined,
      // note: audioDir is CLI-only (the panel uploads through /api/dev/dump);
      // from the panel the seeder always uses synthetic audio
      audioDir: null,
    })
    return NextResponse.json(summary)
  } catch (error) {
    console.error('Dev seed error:', error)
    return NextResponse.json({ error: 'Seed failed' }, { status: 500 })
  }
}

/** Purge all dev-* accounts (beats/events/offers cascade). */
export async function DELETE() {
  const blocked = guard()
  if (blocked) return blocked

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const count = await purgeDevDataset()
    return NextResponse.json({ purged: count })
  } catch (error) {
    console.error('Dev purge error:', error)
    return NextResponse.json({ error: 'Purge failed' }, { status: 500 })
  }
}
