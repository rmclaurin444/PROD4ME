import { NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { listReceipts, listSales } from '@/lib/receipts'

export const dynamic = 'force-dynamic'

/** GET /api/account/receipts — artists: their purchase receipts;
 *  producers: sales of their beats. (Settings → Receipts / Sales) */
export async function GET() {
  const authed = await requireVerifiedUser()
  if (authed instanceof NextResponse) return authed

  if (authed.role === 'PRODUCER') {
    return NextResponse.json({ kind: 'sales', items: await listSales(authed.userId) })
  }
  return NextResponse.json({ kind: 'receipts', items: await listReceipts(authed.userId) })
}
