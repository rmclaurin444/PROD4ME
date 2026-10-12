import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { dollarsToCents } from '@/lib/offers'
import { MAX_PRICE_DOLLARS } from '@/lib/money'

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status })
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return bad('Unauthorized', 401)
  if (session.user.role !== 'PRODUCER') return bad('Only producers can edit beats', 403)

  const { id } = await ctx.params

  let body: { price?: unknown; exclusivePrice?: unknown }
  try {
    body = await request.json()
  } catch {
    return bad('Invalid request body')
  }

  const beat = await prisma.beat.findUnique({ where: { id } })
  if (!beat) return bad('Beat not found', 404)
  if (beat.producerId !== session.user.id) return bad('You can only edit your own beats', 403)

  const price = body.price === undefined ? beat.price : Number(body.price)
  if (
    body.price !== undefined &&
    (typeof body.price !== 'number' || !Number.isFinite(price) || price < 0 || price > MAX_PRICE_DOLLARS)
  ) {
    return bad(`Price must be 0 or between 0.5 and ${MAX_PRICE_DOLLARS}`)
  }
  if (price > 0 && price < 0.5) {
    return bad('Price must be $0 (free) or at least $0.50')
  }

  let exclusivePriceCents: number | null
  if (body.exclusivePrice === undefined) {
    exclusivePriceCents = beat.exclusivePriceCents
  } else if (body.exclusivePrice === null || body.exclusivePrice === '') {
    exclusivePriceCents = null
  } else {
    const exclusive = Number(body.exclusivePrice)
    if (!Number.isFinite(exclusive) || exclusive < 0.5) {
      return bad('Exclusive price must be at least $0.50')
    }
    if (exclusive > MAX_PRICE_DOLLARS) {
      return bad(`Exclusive price must be at most $${MAX_PRICE_DOLLARS}`)
    }
    if (exclusive <= price) {
      return bad('Exclusive price must be greater than the non-exclusive price')
    }
    exclusivePriceCents = dollarsToCents(exclusive)
  }

  if (beat.exclusiveSold && exclusivePriceCents !== beat.exclusivePriceCents) {
    return bad('Exclusive price cannot be changed once the exclusive has sold', 409)
  }

  const updated = await prisma.beat.update({
    where: { id },
    data: { price, exclusivePriceCents },
  })
  return NextResponse.json({ beat: updated })
}
