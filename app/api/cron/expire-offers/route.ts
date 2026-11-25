import { NextResponse } from 'next/server'
import { expireStaleOffers } from '@/lib/offers'
import { deleteOldRateLimits } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Hourly cron job — protected with `Authorization: Bearer ${CRON_SECRET}`.
 * Expires stale offers and deletes rate-limit rows older than 24 hours.
 * On Railway it is called by the `cron-expire-offers` service (DEPLOY.md).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await expireStaleOffers()
    const rateLimitsDeleted = await deleteOldRateLimits()
    return NextResponse.json({ expired: result.count, rateLimitsDeleted })
  } catch (error) {
    console.error('Expire-offers cron error:', error)
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 })
  }
}
