import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  WAITING_OFFER_STATUSES,
  dollarsToCents,
  isStripeSafeAmount,
  newOfferExpiry,
  offerExpired,
  shapeOffer,
} from '@/lib/offers'

import type { Prisma } from '@prisma/client'

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status })
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return bad('Unauthorized', 401)
  if (session.user.role !== 'PRODUCER' && session.user.role !== 'ARTIST') {
    return bad('Forbidden', 403)
  }

  const { id } = await ctx.params

  let body: { action?: string; counterAmount?: unknown; counterMessage?: unknown }
  try {
    body = await request.json()
  } catch {
    return bad('Invalid request body')
  }

  const offer = await prisma.offer.findUnique({
    where: { id },
    include: { beat: true, artist: true, producer: true },
  })
  if (!offer) return bad('Offer not found', 404)

  const role = session.user.role
  const isProducerOwner = role === 'PRODUCER' && offer.producerId === session.user.id
  const isArtistOwner = role === 'ARTIST' && offer.artistId === session.user.id
  if (!isProducerOwner && !isArtistOwner) {
    return bad('You cannot act on this offer', 403)
  }

  if (!WAITING_OFFER_STATUSES.includes(offer.status as (typeof WAITING_OFFER_STATUSES)[number])) {
    return bad(`Offer is ${offer.status.toLowerCase()} — no action available`, 409)
  }

  if (offerExpired(offer)) {
    await prisma.offer.update({
      where: { id },
      data: { status: 'EXPIRED', expiresAt: null },
    })
    return bad('This offer has expired', 409)
  }

  let data: Prisma.OfferUpdateInput | null = null

  switch (body.action) {
    case 'accept': {
      if (!isProducerOwner) return bad('Only the producer can accept this offer', 403)
      if (offer.status !== 'PENDING') return bad('Only pending offers can be accepted', 409)
      data = { status: 'AWAITING_PAYMENT', agreedAmountCents: offer.amountCents, expiresAt: newOfferExpiry() }
      break
    }
    case 'counter': {
      if (!isProducerOwner) return bad('Only the producer can counter this offer', 403)
      if (offer.status !== 'PENDING') return bad('Only pending offers can be countered', 409)
      const counterAmount = Number(body.counterAmount)
      if (typeof body.counterAmount !== 'number' || !Number.isFinite(counterAmount)) {
        return bad('Counter amount is required')
      }
      const counterCents = dollarsToCents(counterAmount)
      if (!isStripeSafeAmount(counterCents)) return bad('Counter must be at least $0.50')
      if (counterCents > offer.listingPriceCents) {
        return bad(`Counter cannot exceed the listing price ($${(offer.listingPriceCents / 100).toFixed(2)})`)
      }
      data = {
        status: 'COUNTERED',
        counterAmountCents: counterCents,
        counterMessage:
          typeof body.counterMessage === 'string' ? body.counterMessage.trim().slice(0, 500) || null : null,
        expiresAt: newOfferExpiry(),
      }
      break
    }
    case 'decline': {
      if (isProducerOwner && offer.status !== 'PENDING') {
        return bad('Only pending offers can be declined', 409)
      }
      if (isArtistOwner && offer.status !== 'COUNTERED') {
        return bad('Only countered offers can be declined', 409)
      }
      data = { status: 'DECLINED', expiresAt: null }
      break
    }
    case 'accept-counter': {
      if (!isArtistOwner) return bad('Only the artist can respond to a counter', 403)
      if (offer.status !== 'COUNTERED') return bad('No counter to accept', 409)
      if (offer.licenseType === 'EXCLUSIVE' && offer.beat.exclusiveSold) {
        return bad('The exclusive license has already sold', 409)
      }
      if (offer.counterAmountCents === null) return bad('Counter amount missing', 409)
      data = { status: 'AWAITING_PAYMENT', agreedAmountCents: offer.counterAmountCents, expiresAt: newOfferExpiry() }
      break
    }
    default:
      return bad('Unknown action')
  }

  if (!data) return bad('Unknown action')

  const updated = await prisma.offer.update({
    where: { id },
    data,
    include: { beat: true, artist: true, producer: true },
  })
  return NextResponse.json({ offer: shapeOffer(updated) })
}
