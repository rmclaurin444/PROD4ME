import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { beatInclude } from '@/lib/beats'
import {
  dollarsToCents,
  expireStaleOffers,
  isStripeSafeAmount,
  newOfferExpiry,
  shapeOffer,
} from '@/lib/offers'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const role = session.user.role
  if (role !== 'ARTIST' && role !== 'PRODUCER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await expireStaleOffers()
  const offers = await prisma.offer.findMany({
    where: role === 'PRODUCER' ? { producerId: session.user.id } : { artistId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { beat: true, artist: true, producer: true },
  })

  return NextResponse.json({ offers: offers.map(shapeOffer) })
}

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return bad('Unauthorized', 401)
  if (session.user.role !== 'ARTIST') return bad('Only artists can make offers', 403)

  let body: { beatId?: string; licenseType?: string; amount?: unknown; message?: unknown }
  try {
    body = await request.json()
  } catch {
    return bad('Invalid request body')
  }

  const { beatId, licenseType, message } = body
  if (!beatId) return bad('beatId is required')
  if (licenseType !== 'NON_EXCLUSIVE' && licenseType !== 'EXCLUSIVE') {
    return bad('Choose a license type')
  }

  const amount = Number(body.amount)
  if (typeof body.amount !== 'number' || !Number.isFinite(amount)) {
    return bad('Offer must be a number')
  }
  const amountCents = dollarsToCents(amount)
  if (!isStripeSafeAmount(amountCents)) {
    return bad('Offer must be at least $0.50')
  }

  const beat = await prisma.beat.findUnique({ include: beatInclude, where: { id: beatId } })
  if (!beat) return bad('Beat not found', 404)
  if (beat.producerId === session.user.id) {
    return bad('You cannot make offers on your own beat', 403)
  }

  const listingPriceCents =
    licenseType === 'EXCLUSIVE' ? beat.exclusivePriceCents : dollarsToCents(beat.price)
  if (listingPriceCents === null) {
    return bad('This beat is not offered as exclusive')
  }
  if (licenseType === 'EXCLUSIVE' && beat.exclusiveSold) {
    return bad('The exclusive license has already sold', 409)
  }
  if (licenseType === 'NON_EXCLUSIVE' && amountCents > listingPriceCents) {
    return bad(`Offer cannot exceed the listing price ($${beat.price})`)
  }
  if (licenseType === 'EXCLUSIVE' && amountCents > listingPriceCents) {
    return bad(`Offer cannot exceed the exclusive price ($${(listingPriceCents / 100).toFixed(2)})`)
  }

  try {
    const offer = await prisma.offer.create({
      data: {
        beatId,
        artistId: session.user.id,
        producerId: beat.producerId,
        licenseType,
        listingPriceCents,
        amountCents,
        message: typeof message === 'string' ? message.trim().slice(0, 500) || null : null,
        status: 'PENDING',
        expiresAt: newOfferExpiry(),
      },
      include: { beat: true, artist: true, producer: true },
    })
    return NextResponse.json({ offer: shapeOffer(offer) }, { status: 201 })
  } catch (error) {
    console.error('Offer create error:', error)
    return bad('Could not create offer', 500)
  }
}
