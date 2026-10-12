import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import type Stripe from 'stripe'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getStripe, stripeConfigError } from '@/lib/stripe'
import {
  expireStaleOffers,
} from '@/lib/offers'

const SESSION_PAGE = '/checkout/success'

function bad(error: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status })
}

function labelFor(licenseType: string) {
  return licenseType === 'EXCLUSIVE' ? 'Exclusive license' : 'Non-exclusive license'
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return bad('Unauthorized', 401)

  const sessionId = new URL(request.url).searchParams.get('session_id')
  if (!sessionId) return bad('session_id is required')

  const payment = await prisma.payment.findUnique({ where: { stripeSessionId: sessionId } })
  if (!payment || payment.artistId !== session.user.id) {
    return NextResponse.json({ status: null })
  }
  return NextResponse.json({ status: payment.status })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return bad('Unauthorized', 401)
  if (session.user.role !== 'ARTIST') return bad('Only artists can purchase licenses', 403)

  const stripe = getStripe()
  const configError = stripeConfigError()
  if (!stripe || configError) return bad(configError ?? 'Stripe is not available', 503)

  await expireStaleOffers()

  let body: { beatId?: string; licenseType?: string; offerId?: string }
  try {
    body = await request.json()
  } catch {
    return bad('Invalid request body')
  }

  const origin = request.headers.get('origin') ?? 'http://localhost:3000'

  let beatId: string
  let licenseType: 'NON_EXCLUSIVE' | 'EXCLUSIVE'
  let amountCents: number
  let beatTitle: string
  let offerId: string | null = null
  let offerExpiresAt: Date | null = null

  if (body.offerId) {
    const offer = await prisma.offer.findUnique({ include: { beat: true }, where: { id: body.offerId } })
    if (!offer || offer.artistId !== session.user.id) return bad('Offer not found', 404)
    if (offer.status === 'EXPIRED') return bad('This offer has expired', 409)
    if (offer.status !== 'AWAITING_PAYMENT' || offer.agreedAmountCents === null) {
      return bad(`Offer is ${offer.status.toLowerCase()} — nothing to pay yet`, 409)
    }
    if (offer.licenseType === 'EXCLUSIVE' && offer.beat.exclusiveSold) {
      await prisma.offer.update({ where: { id: offer.id }, data: { status: 'DECLINED', expiresAt: null } })
      return bad('The exclusive license has already sold', 409)
    }

    const existing = await prisma.license.findFirst({
      where: { beatId: offer.beatId, artistId: session.user.id, licenseType: offer.licenseType },
    })
    if (existing) return bad('You already have this license', 409)

    beatId = offer.beatId
    licenseType = offer.licenseType
    amountCents = offer.agreedAmountCents
    offerId = offer.id
    offerExpiresAt = offer.expiresAt
    beatTitle = offer.beat.title
  } else {
    if (!body.beatId) return bad('beatId is required')
    if (body.licenseType !== 'NON_EXCLUSIVE' && body.licenseType !== 'EXCLUSIVE') {
      return bad('Choose a license type')
    }
    const beat = await prisma.beat.findUnique({ where: { id: body.beatId } })
    if (!beat) return bad('Beat not found', 404)
    if (beat.producerId === session.user.id) return bad('You cannot purchase your own beat', 403)

    // double-sale protection at checkout creation
    if (body.licenseType === 'EXCLUSIVE') {
      if (beat.exclusivePriceCents === null) return bad('This beat is not offered as exclusive')
      if (beat.exclusiveSold) return bad('The exclusive license has already sold', 409)
      amountCents = beat.exclusivePriceCents
    } else {
      if (beat.price === 0) return bad('This beat is free — use Get Free', 400)
      amountCents = beat.price * 100
    }
    if (amountCents < 50) return bad('Price must be at least $0.50')

  const existing = await prisma.license.findFirst({
    where: { beatId: beat.id, artistId: session.user.id, licenseType: body.licenseType },
  })
  if (existing) return bad('You already have this license', 409)

  beatId = beat.id
  licenseType = body.licenseType
  beatTitle = beat.title
  offerId = null
  offerExpiresAt = null
  }

  // expire any open session for this offer so the artist cannot pay twice
  // expire any open session for this offer (and for this beat+license) so the artist cannot pay twice
  const openPayments = await prisma.payment.findMany({
    where: {
      status: 'PENDING',
      OR: [
        { offerId: offerId ?? undefined },
        { beatId, licenseType, artistId: session.user.id },
      ],
    },
  })
  for (const open of openPayments) {
    try {
      await stripe.checkout.sessions.expire(open.stripeSessionId)
    } catch (error) {
      const code = (error as { code?: string; statusCode?: number }).statusCode
      if (code !== 404) {
        const existingSession = await stripe.checkout.sessions
          .retrieve(open.stripeSessionId)
          .catch(() => null)
        if (existingSession && existingSession.payment_status === 'paid') {
          return bad('A payment for this offer is already processing', 409)
        }
      }
    }
  }
  if (openPayments.length > 0) {
    await prisma.payment.updateMany({
      where: { id: { in: openPayments.map(p => p.id) }, status: 'PENDING' },
      data: { status: 'FAILED' },
    })
  }

  // Stripe Checkout sessions last at most 24 hours; cap at the offer expiry too
  const in24h = Math.floor(Date.now() / 1000) + 24 * 60 * 60
  const offerCap = offerExpiresAt ? Math.floor(offerExpiresAt.getTime() / 1000) + 60 : in24h
  const thirtyMinutes = Math.floor(Date.now() / 1000) + 30 * 60
  const expiresAt = Math.max(Math.min(in24h, offerCap), thirtyMinutes)

  const payment = await prisma.payment.create({
    data: {
      stripeSessionId: `pending_${randomUUID()}`,
      amountCents,
      status: 'PENDING',
      beatId,
      artistId: session.user.id,
      licenseType,
      offerId,
    },
  })

  try {
    const checkoutSession = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: amountCents,
              product_data: { name: beatTitle },
            },
          },
        ],
        success_url: `${origin}${SESSION_PAGE}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?checkout=canceled`,
        client_reference_id: payment.id,
        metadata: {
          paymentId: payment.id,
          beatId,
          artistId: session.user.id,
          licenseType,
          offerId: offerId ?? '',
        },
        expires_at: expiresAt,
      },
      { idempotencyKey: `checkout_${payment.id}` }
    )

    await prisma.payment.update({
      where: { id: payment.id },
      data: { stripeSessionId: checkoutSession.id },
    })

    return NextResponse.json({ url: checkoutSession.url, paymentId: payment.id }, { status: 201 })
  } catch (error) {
    console.error('Checkout session error:', error)
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } })
    return bad('Could not start checkout', 502)
  }
}
