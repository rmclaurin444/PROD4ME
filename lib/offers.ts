import { prisma } from '@/lib/prisma'
import type { Offer, Prisma } from '@prisma/client'
import { dollarsToCents, formatMoney, isStripeSafeAmount, timeLeftLabel } from '@/lib/money'

export const OFFER_TTL_HOURS = 48
export const OFFER_TTL_MS = OFFER_TTL_HOURS * 60 * 60 * 1000

export const WAITING_OFFER_STATUSES = ['PENDING', 'COUNTERED', 'AWAITING_PAYMENT'] as const

export type WaitingOfferStatus = (typeof WAITING_OFFER_STATUSES)[number]

export { dollarsToCents, formatMoney, isStripeSafeAmount, timeLeftLabel }

export function newOfferExpiry(now = Date.now()) {
  return new Date(now + OFFER_TTL_MS)
}

export function isWaitingStatus(status: string): status is WaitingOfferStatus {
  return (WAITING_OFFER_STATUSES as readonly string[]).includes(status)
}

export async function expireStaleOffers() {
  return prisma.offer.updateMany({
    where: {
      status: { in: [...WAITING_OFFER_STATUSES] },
      expiresAt: { lt: new Date() },
    },
    data: { status: 'EXPIRED', expiresAt: null },
  })
}

export function offerExpired(offer: Pick<Offer, 'status' | 'expiresAt'>) {
  return offer.expiresAt !== null && offer.expiresAt < new Date() && isWaitingStatus(offer.status)
}

const offerInclude = {
  beat: true,
  artist: { select: { id: true, name: true, avatar: true } },
  producer: { select: { id: true, name: true, avatar: true } },
} satisfies Prisma.OfferInclude

type OfferWithJoins = Prisma.OfferGetPayload<{ include: typeof offerInclude }>

export type ShapedOffer = {
  id: string
  status: string
  licenseType: string
  listingPriceCents: number
  amountCents: number
  counterAmountCents: number | null
  agreedAmountCents: number | null
  message: string | null
  counterMessage: string | null
  expiresAt: string | null
  createdAt: string
  beat: {
    id: string
    title: string
    price: number
    exclusivePriceCents: number | null
    exclusiveSold: boolean
  }
  artist: { id: string; name: string; avatar: string | null }
  producer: { id: string; name: string; avatar: string | null }
}

export type ShapedLicense = {
  id: string
  licenseType: string
  pricePaidCents: number
  createdAt: string
  beat: ShapedOffer['beat'] & { producer: string; artUrl: string | null; artPreset: string | null }
}

export function shapeOffer(offer: OfferWithJoins): ShapedOffer {
  return {
    id: offer.id,
    status: offer.status,
    licenseType: offer.licenseType,
    listingPriceCents: offer.listingPriceCents,
    amountCents: offer.amountCents,
    counterAmountCents: offer.counterAmountCents,
    agreedAmountCents: offer.agreedAmountCents,
    message: offer.message,
    counterMessage: offer.counterMessage,
    expiresAt: offer.expiresAt ? offer.expiresAt.toISOString() : null,
    createdAt: offer.createdAt.toISOString(),
    beat: {
      id: offer.beat.id,
      title: offer.beat.title,
      price: offer.beat.price,
      exclusivePriceCents: offer.beat.exclusivePriceCents,
      exclusiveSold: offer.beat.exclusiveSold,
    },
    artist: {
      id: offer.artist.id,
      name: offer.artist.name,
      avatar: offer.artist.avatar,
    },
    producer: {
      id: offer.producer.id,
      name: offer.producer.name,
      avatar: offer.producer.avatar,
    },
  }
}
