import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'
import { scoreWeek, type ScoredBeat, type ScoredProducer, type LeaderboardBreakdown } from '@/lib/leaderboard/score'
import { weekStartFor, weekLabel, parseWeekLabel, prevWeekStart } from '@/lib/leaderboard/week'
import { beatInclude, shapeBeat, type ShapedBeat } from '@/lib/beats'
import { getInitials } from '@/components/app/data'

/**
 * Leaderboard reads for the app UI.
 *   GET /api/leaderboard?kind=beat|producer&week=current|YYYY-MM-DD
 *
 * The current week is scored live and cached in memory for 15 minutes, so new
 * engagement shows up within that window. Past weeks read from snapshots
 * (immutable once saved).
 */

const CACHE_TTL_MS = 15 * 60 * 1000
const cache = new Map<string, { at: number; score: Awaited<ReturnType<typeof scoreWeek>> }>()

async function scoreCached(weekStart: Date, excludeDev: boolean) {
  const key = `${weekStart.toISOString()}|${excludeDev}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.score
  const score = await scoreWeek(weekStart, { excludeDev })
  cache.set(key, { at: Date.now(), score })
  return score
}

type LeaderEntry = {
  rank: number
  score: number
  breakdown: { streams: number; likes: number; comments: number; shares: number; saves: number; purchases: number }
  beat: ShapedBeat | null
  producer: { id: string; name: string; avatar: string } | null
}

export async function GET(request: Request) {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified
  const session = { user: { id: verified.userId, role: verified.role, emailVerified: true } }

  const url = new URL(request.url)
  const kind = url.searchParams.get('kind') === 'producer' ? 'PRODUCER' : 'BEAT'
  const weekParam = url.searchParams.get('week') ?? 'current'
  const isLive = weekParam === 'current'

  const excludeDev = process.env.NODE_ENV === 'production'
  const currentWeekStart = weekStartFor(new Date())

  let weekStart: Date
  if (isLive) {
    weekStart = currentWeekStart
  } else {
    const parsed = parseWeekLabel(weekParam)
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid week — use current or YYYY-MM-DD' }, { status: 400 })
    }
    weekStart = parsed
  }

  const availableWeeks = (
    await prisma.leaderboardSnapshot.findMany({
      select: { weekStart: true },
      distinct: ['weekStart'],
      orderBy: { weekStart: 'desc' },
    })
  ).map(row => weekLabel(row.weekStart))

  let entries: LeaderEntry[] = []
  let mine: { rank: number | null; score: number; breakdown: LeaderboardBreakdown } | null = null

  if (isLive) {
    const score = await scoreCached(weekStart, excludeDev)
    if (kind === 'BEAT') {
      const top = score.beats.slice(0, 50)
      const beatRows = await prisma.beat.findMany({
        where: { id: { in: top.map(entry => entry.beatId) } },
        include: beatInclude,
      })
      const shaped = new Map<string, ShapedBeat>()
      for (const row of beatRows) shaped.set(row.id, await shapeBeat(row))
      entries = top
        .map((entry, index) => ({
          rank: index + 1,
          score: Math.round(entry.score),
          breakdown: entry.breakdown,
          beat: shaped.get(entry.beatId) ?? null,
          producer: null as LeaderEntry['producer'],
        }))
        .filter(entry => entry.beat)
    } else {
      const top = score.producers.slice(0, 50)
      const producerRows = await prisma.user.findMany({
        where: { id: { in: top.map(entry => entry.producerId) } },
        select: { id: true, name: true, avatar: true },
      })
      const rowsById = new Map(producerRows.map(row => [row.id, row]))
      entries = top
        .map((entry, index) => {
          const row = rowsById.get(entry.producerId)
          if (!row) return null
          const result: LeaderEntry = {
            rank: index + 1,
            score: Math.round(entry.score),
            breakdown: entry.breakdown,
            beat: null,
            producer: {
              id: row.id,
              name: row.name,
              avatar: row.avatar ?? getInitials(row.name),
            },
          }
          return result
        })
        .filter((entry): entry is LeaderEntry => entry !== null)
    }

    if (session.user.role === 'PRODUCER') {
      const list = kind === 'BEAT' ? score.beats : score.producers
      const own = kind === 'BEAT' ? list.find(entry => entry.producerId === session.user.id) : null
      const ownProducer = kind === 'PRODUCER' ? list.find(entry => entry.producerId === session.user.id) : null
      const found = own ?? ownProducer
      if (found) {
        const rank = list.findIndex(entry => (kind === 'BEAT' ? entry.producerId === session.user.id : entry.producerId === session.user.id)) + 1
        mine = {
          rank: rank > 0 ? rank : null,
          score: Math.round(found.score),
          breakdown: found.breakdown,
        }
      } else {
        mine = { rank: null, score: 0, breakdown: { streams: 0, likes: 0, comments: 0, shares: 0, saves: 0, purchases: 0 } }
      }
    }
  } else {
    const rows = await prisma.leaderboardSnapshot.findMany({
      where: { weekStart, kind },
      orderBy: { rank: 'asc' },
      take: 50,
    })

    if (kind === 'BEAT') {
      const beatIds = rows.map(row => row.beatId).filter((id): id is string => id !== null)
      const beatRows = beatIds.length
        ? await prisma.beat.findMany({ where: { id: { in: beatIds } }, include: beatInclude })
        : []
      const shaped = new Map<string, ShapedBeat>()
      for (const row of beatRows) shaped.set(row.id, await shapeBeat(row))
      entries = rows
        .map(row => {
          const beat = row.beatId ? shaped.get(row.beatId) ?? null : null
          const result: LeaderEntry = {
            rank: row.rank,
            score: row.score,
            breakdown: row.breakdown as LeaderEntry['breakdown'],
            beat,
            producer: null,
          }
          return result
        })
        .filter(entry => entry.beat)
    } else {
      const producerIds = rows.map(row => row.producerId).filter((id): id is string => id !== null)
      const producerRows = producerIds.length
        ? await prisma.user.findMany({
            where: { id: { in: producerIds } },
            select: { id: true, name: true, avatar: true },
          })
        : []
      const rowsById = new Map(producerRows.map(row => [row.id, row]))
      entries = rows
        .map(row => {
          const user = row.producerId ? rowsById.get(row.producerId) : null
          const result: LeaderEntry = {
            rank: row.rank,
            score: row.score,
            breakdown: row.breakdown as LeaderEntry['breakdown'],
            beat: null,
            producer: user
              ? { id: user.id, name: user.name, avatar: user.avatar ?? getInitials(user.name) }
              : null,
          }
          return result
        })
        .filter(entry => entry.producer)
    }
  }

  return NextResponse.json({
    kind,
    week: weekLabel(weekStart),
    isLive,
    entries,
    mine,
    availableWeeks,
    // the previous week label, for the selector's "past weeks" affordance
    lastCompletedWeek: weekLabel(prevWeekStart(currentWeekStart)),
  })
}

