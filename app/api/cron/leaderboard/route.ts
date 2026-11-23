import { NextResponse } from 'next/server'
import { snapshotPreviousWeek } from '@/lib/leaderboard/score'

export const dynamic = 'force-dynamic'

/**
 * Weekly leaderboard snapshot job. Protected with
 * `Authorization: Bearer ${CRON_SECRET}`. Saves the previous week's top 50
 * beats and producers; no-ops if that week already has snapshots.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await snapshotPreviousWeek()
    return NextResponse.json({
      saved: result.saved,
      weekStart: result.weekStart.toISOString(),
    })
  } catch (error) {
    console.error('Leaderboard snapshot error:', error)
    return NextResponse.json({ error: 'Snapshot failed' }, { status: 500 })
  }
}
