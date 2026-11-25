import { Prisma } from '@prisma/client'
import { prisma } from '../prisma.ts'
import { sendEmail } from '../email.ts'
import { isStripeTestMode } from '../stripe.ts'
import { receiptEmail, type ReceiptDetails } from './receipt.ts'
import { saleNoticeEmail } from './sale.ts'
import { freeClaimEmail } from './free-claim.ts'
import {
  exclusiveSoldEmail,
  newOfferEmail,
  offerAcceptedEmail,
  offerClosedEmail,
  offerCounteredEmail,
  type OfferEmailInput,
} from './offers.ts'
import type { EmailBody, LicenseKind } from './shared.ts'

/**
 * Transactional email dispatch (Prompt 15).
 *
 * Rules enforced here, in one place:
 *  - only users with `emailVerifiedAt` set get these emails
 *  - offer emails respect `User.emailOffers`, sale notices `User.emailSales`;
 *    receipts and free-claim confirmations are always sent
 *  - each email is sent ONCE: payments claim `receiptSentAt` /
 *    `saleNoticeSentAt` with a conditional update (null → now); everything
 *    else claims an `EmailLog` row (unique kind+refId+userId). A failed send
 *    releases the claim so a later retry (e.g. a Stripe redelivery) can send.
 *  - callers schedule these with `afterResponse()` (lib/emails/after.ts)
 *    after their database change has committed, and a failed email never
 *    fails the webhook, the offer action, or the claim.
 */

type Recipient = {
  id: string
  email: string
  emailVerifiedAt: Date | null
}

async function deliver(to: Recipient, body: EmailBody): Promise<boolean> {
  try {
    await sendEmail({ to: to.email, ...body })
    return true
  } catch (error) {
    // never log the address or contents — just which email failed
    console.error(`Email "${body.subject}" to user ${to.id} failed:`, error)
    return false
  }
}

/** Claims an EmailLog row, sends, and releases the claim if sending fails. */
async function sendOnce(kind: string, refId: string, to: Recipient, body: EmailBody): Promise<void> {
  if (!to.emailVerifiedAt) return
  try {
    await prisma.emailLog.create({ data: { kind, refId, userId: to.id } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return // already sent
    throw error
  }
  const ok = await deliver(to, body)
  if (!ok) await prisma.emailLog.deleteMany({ where: { kind, refId, userId: to.id } })
}

// ---- payments: purchase receipt + sale notification ------------------------

const paymentSelect = {
  id: true,
  stripeSessionId: true,
  status: true,
  amountCents: true,
  licenseType: true,
  offerId: true,
  createdAt: true,
  receiptSentAt: true,
  saleNoticeSentAt: true,
  beat: {
    select: {
      title: true,
      producer: { select: { id: true, name: true, email: true, emailVerifiedAt: true, emailSales: true } },
    },
  },
  artist: { select: { id: true, username: true, email: true, emailVerifiedAt: true } },
} satisfies Prisma.PaymentSelect

type PaymentForEmail = Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>

/** A payment's own mode: Stripe test-mode Checkout Session ids start with
 *  `cs_test_` (falls back to the current key for unexpected ids). */
function paymentWasTestMode(stripeSessionId: string): boolean {
  if (stripeSessionId.startsWith('cs_test_')) return true
  if (stripeSessionId.startsWith('cs_live_')) return false
  return isStripeTestMode()
}

export function receiptDetailsFromPayment(payment: {
  id: string
  stripeSessionId: string
  createdAt: Date
  amountCents: number
  licenseType: LicenseKind
  offerId: string | null
  beat: { title: string; producer: { name: string } }
}): ReceiptDetails {
  return {
    receiptNumber: payment.id,
    date: payment.createdAt,
    beatTitle: payment.beat.title,
    producerName: payment.beat.producer.name,
    licenseType: payment.licenseType,
    amountCents: payment.amountCents,
    fromOffer: payment.offerId !== null,
    testMode: paymentWasTestMode(payment.stripeSessionId),
  }
}

/** Claims a Payment send-once marker atomically; true if this call owns it. */
async function claimPaymentMarker(paymentId: string, field: 'receiptSentAt' | 'saleNoticeSentAt') {
  const result = await prisma.payment.updateMany({
    where: { id: paymentId, status: 'SUCCEEDED', [field]: null },
    data: { [field]: new Date() },
  })
  return result.count === 1
}

async function releasePaymentMarker(paymentId: string, field: 'receiptSentAt' | 'saleNoticeSentAt') {
  await prisma.payment.updateMany({ where: { id: paymentId }, data: { [field]: null } })
}

/** Receipt → artist, sale notice → producer. Safe to call on every webhook
 *  delivery / success-page self-heal: each email sends once. */
export async function sendPaymentEmails(paymentId: string): Promise<void> {
  const payment: PaymentForEmail | null = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: paymentSelect,
  })
  if (!payment || payment.status !== 'SUCCEEDED') return

  // receipt: always on (a record of the transaction)
  if (payment.receiptSentAt === null && payment.artist.emailVerifiedAt) {
    if (await claimPaymentMarker(payment.id, 'receiptSentAt')) {
      const ok = await deliver(payment.artist, receiptEmail(receiptDetailsFromPayment(payment)))
      if (!ok) await releasePaymentMarker(payment.id, 'receiptSentAt')
    }
  }

  // sale notice: respects the producer's "Sales of my beats" toggle
  const producer = payment.beat.producer
  if (payment.saleNoticeSentAt === null && producer.emailVerifiedAt && producer.emailSales) {
    if (await claimPaymentMarker(payment.id, 'saleNoticeSentAt')) {
      const ok = await deliver(
        producer,
        saleNoticeEmail({
          beatTitle: payment.beat.title,
          buyerUsername: payment.artist.username,
          licenseType: payment.licenseType,
          amountCents: payment.amountCents,
          date: payment.createdAt,
          testMode: paymentWasTestMode(payment.stripeSessionId),
        })
      )
      if (!ok) await releasePaymentMarker(payment.id, 'saleNoticeSentAt')
    }
  }
}

// ---- free claims ---------------------------------------------------------

export async function sendFreeClaimEmail(licenseId: string): Promise<void> {
  const license = await prisma.license.findUnique({
    where: { id: licenseId },
    select: {
      id: true,
      licenseType: true,
      createdAt: true,
      beat: { select: { title: true, producer: { select: { name: true } } } },
      artist: { select: { id: true, email: true, emailVerifiedAt: true } },
    },
  })
  if (!license) return
  await sendOnce(
    'FREE_CLAIM',
    license.id,
    license.artist,
    freeClaimEmail({
      beatTitle: license.beat.title,
      producerName: license.beat.producer.name,
      licenseType: license.licenseType,
      date: license.createdAt,
    })
  )
}

// ---- offers --------------------------------------------------------------

const offerParty = { select: { id: true, email: true, name: true, username: true, emailVerifiedAt: true, emailOffers: true } }

const offerSelect = {
  id: true,
  beatId: true,
  licenseType: true,
  amountCents: true,
  counterAmountCents: true,
  agreedAmountCents: true,
  expiresAt: true,
  beat: { select: { title: true } },
  artist: offerParty,
  producer: offerParty,
} satisfies Prisma.OfferSelect

type OfferForEmail = Prisma.OfferGetPayload<{ select: typeof offerSelect }>

function offerInput(offer: OfferForEmail, amountCents: number): OfferEmailInput {
  return {
    beatId: offer.beatId,
    beatTitle: offer.beat.title,
    licenseType: offer.licenseType,
    artistUsername: offer.artist.username,
    producerName: offer.producer.name,
    amountCents,
    expiresAt: offer.expiresAt,
    testMode: isStripeTestMode(),
  }
}

/** The latest amount on the table: agreed, else countered, else offered. */
function latestAmount(offer: OfferForEmail): number {
  return offer.agreedAmountCents ?? offer.counterAmountCents ?? offer.amountCents
}

export type OfferEvent = 'NEW' | 'COUNTERED' | 'ACCEPTED' | 'DECLINED'

/**
 *  NEW       → producer  (artist made an offer)
 *  COUNTERED → artist    (only producers counter)
 *  ACCEPTED  → artist    (producer accepted: pay before the deadline)
 *  DECLINED  → artist    (producer declined; an artist declining a counter
 *                         is their own action, so no email is sent for it)
 */
export async function sendOfferEmail(event: OfferEvent, offerId: string): Promise<void> {
  const offer = await prisma.offer.findUnique({ where: { id: offerId }, select: offerSelect })
  if (!offer) return

  switch (event) {
    case 'NEW':
      if (!offer.producer.emailOffers) return
      return sendOnce('OFFER_NEW', offer.id, offer.producer, newOfferEmail(offerInput(offer, offer.amountCents)))
    case 'COUNTERED':
      if (!offer.artist.emailOffers || offer.counterAmountCents === null) return
      return sendOnce(
        'OFFER_COUNTERED',
        offer.id,
        offer.artist,
        offerCounteredEmail(offerInput(offer, offer.counterAmountCents))
      )
    case 'ACCEPTED':
      if (!offer.artist.emailOffers) return
      return sendOnce('OFFER_ACCEPTED', offer.id, offer.artist, offerAcceptedEmail(offerInput(offer, latestAmount(offer))))
    case 'DECLINED':
      if (!offer.artist.emailOffers) return
      return sendOnce(
        'OFFER_DECLINED',
        offer.id,
        offer.artist,
        offerClosedEmail(offerInput(offer, latestAmount(offer)), 'declined')
      )
  }
}

async function sendToArtists(
  offerIds: string[],
  kind: string,
  build: (input: OfferEmailInput) => EmailBody
): Promise<void> {
  if (offerIds.length === 0) return
  const offers = await prisma.offer.findMany({ where: { id: { in: offerIds } }, select: offerSelect })
  for (const offer of offers) {
    if (!offer.artist.emailOffers) continue
    try {
      await sendOnce(kind, offer.id, offer.artist, build(offerInput(offer, latestAmount(offer))))
    } catch (error) {
      console.error(`Offer email ${kind} for offer ${offer.id} failed:`, error)
    }
  }
}

/** Offers just moved to EXPIRED (lazy expiry or the hourly cron). */
export async function sendOfferExpiredEmails(offerIds: string[]): Promise<void> {
  await sendToArtists(offerIds, 'OFFER_EXPIRED', input => offerClosedEmail(input, 'expired'))
}

/** Open offers closed because the beat's exclusive license sold. */
export async function sendExclusiveSoldEmails(offerIds: string[]): Promise<void> {
  await sendToArtists(offerIds, 'EXCLUSIVE_SOLD', exclusiveSoldEmail)
}
