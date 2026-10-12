import { NextResponse } from 'next/server'
import { expireStaleOffers } from '@/lib/offers'

export const dynamic = 'force-dynamic'

export async function GET() {
  const result = await expireStaleOffers()
  return NextResponse.json({ expired: result.count })
}
