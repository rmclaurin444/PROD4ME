/**
 * One-time backfill: recalculates Beat.streams/likes/saves/comments/shares
 * from the existing EngagementEvent history using the same rules as
 * POST /api/events:
 *  - a producer's events on their own beats never count
 *  - streams: STREAM events, at most one per user per beat per 10 minutes
 *    (events are bucketed by the 10-minute window, matching the forward rule)
 *  - likes/saves/comments/shares: one per distinct (user, beat)
 *
 * Run: node --env-file=.env scripts/backfill-beat-counters.ts
 */
import { prisma } from '../lib/prisma.ts'

const STREAM_WINDOW_MS = 10 * 60 * 1000

async function main() {
  const [events, beats] = await Promise.all([
    prisma.engagementEvent.findMany({
      select: { userId: true, beatId: true, type: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.beat.findMany({ select: { id: true, producerId: true, streams: true, likes: true, saves: true, comments: true, shares: true } }),
  ])

  const producerOf = new Map(beats.map(b => [b.id, b.producerId]))
  const current = new Map(beats.map(b => [b.id, b]))

  type Tally = {
    streams: Set<string>
    likes: Set<string>
    saves: Set<string>
    comments: Set<string>
    shares: Set<string>
  }
  const tallies = new Map<string, Tally>()
  const tallyFor = (beatId: string): Tally => {
    let t = tallies.get(beatId)
    if (!t) {
      t = { streams: new Set(), likes: new Set(), saves: new Set(), comments: new Set(), shares: new Set() }
      tallies.set(beatId, t)
    }
    return t
  }

  let skippedOwn = 0
  for (const event of events) {
    // a producer's events on their own beats never bump counters
    if (producerOf.get(event.beatId) === event.userId) {
      skippedOwn += 1
      continue
    }
    const t = tallyFor(event.beatId)
    if (event.type === 'STREAM') {
      // one stream per user per 10-minute window
      const bucket = Math.floor(event.createdAt.getTime() / STREAM_WINDOW_MS)
      t.streams.add(`${event.userId}|${bucket}`)
    } else if (event.type === 'LIKE') t.likes.add(event.userId)
    else if (event.type === 'SAVE') t.saves.add(event.userId)
    else if (event.type === 'COMMENT') t.comments.add(event.userId)
    else if (event.type === 'SHARE') t.shares.add(event.userId)
  }

  let updated = 0
  let checked = 0
  for (const beat of beats) {
    checked += 1
    const t = tallies.get(beat.id)
    const next = {
      streams: t?.streams.size ?? 0,
      likes: t?.likes.size ?? 0,
      saves: t?.saves.size ?? 0,
      comments: t?.comments.size ?? 0,
      shares: t?.shares.size ?? 0,
    }
    const unchanged =
      beat.streams === next.streams &&
      beat.likes === next.likes &&
      beat.saves === next.saves &&
      beat.comments === next.comments &&
      beat.shares === next.shares
    if (unchanged) continue
    await prisma.beat.update({ where: { id: beat.id }, data: next })
    updated += 1
    console.log(
      `updated "${beat.id}": streams ${beat.streams}→${next.streams}, likes ${beat.likes}→${next.likes}, saves ${beat.saves}→${next.saves}, comments ${beat.comments}→${next.comments}, shares ${beat.shares}→${next.shares}`
    )
  }

  console.log(
    `Backfill complete: ${checked} beats checked, ${updated} updated, ${skippedOwn} own-beat events skipped, ${events.length} events scanned.`
  )
  await prisma.$disconnect()
}

main().catch(e => {
  console.error('Backfill failed:', e)
  process.exit(1)
})
