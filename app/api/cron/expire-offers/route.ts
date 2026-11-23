import { NextResponse } from 'next/server'
import { expireStaleOffers } from '@/lib/offers'

export const dynamic = 'force-dynamic'

/** Cron job — protected with `Authorization: Bearer ${CRON_SECRET}`. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await expireStaleOffers()
  return NextResponse.json({ expired: result.count })
}
