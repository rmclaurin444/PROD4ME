import { NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'

/**
 * PATCH /api/account/email-preferences — { emailOffers?, emailSales? }
 * Offer updates and sale notices can be turned off. Purchase receipts and
 * free-claim confirmations are always sent (records of a transaction).
 */
export async function PATCH(request: Request) {
  const authed = await requireVerifiedUser()
  if (authed instanceof NextResponse) return authed

  let body: { emailOffers?: unknown; emailSales?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const data: { emailOffers?: boolean; emailSales?: boolean } = {}
  if (typeof body.emailOffers === 'boolean') data.emailOffers = body.emailOffers
  if (typeof body.emailSales === 'boolean') data.emailSales = body.emailSales
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id: authed.userId },
    data,
    select: { emailOffers: true, emailSales: true },
  })
  return NextResponse.json(user)
}
