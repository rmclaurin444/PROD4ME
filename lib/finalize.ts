import { Prisma } from '@prisma/client'
import type Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import { WAITING_OFFER_STATUSES } from '@/lib/offers'
import { recordEngagementEvent } from '@/lib/recommendations/record.ts'
import { afterResponse } from '@/lib/emails/after'
import { sendExclusiveSoldEmails, sendPaymentEmails } from '@/lib/emails/send'

export class UnpurchaseableError extends Error {}

type CheckoutSessionLike = Pick<Stripe.Checkout.Session, 'id' | 'payment_status' | 'payment_intent' | 'metadata'> & {
  amount_total?: number | null
}

function paymentIntentId(intent: Stripe.Checkout.Session['payment_intent']): string | null {
  if (typeof intent === 'string') return intent
  return null
}

export async function finalizeCheckoutSession(session: CheckoutSessionLike) {
  const metadata = session.metadata ?? {}
  const paymentId = metadata.paymentId
  if (!paymentId) return { handled: false, reason: 'missing-metadata' }

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } })
  if (!payment || payment.stripeSessionId !== session.id) {
    return { handled: false, reason: 'payment-not-found' }
  }

  if (payment.status === 'SUCCEEDED') {
    // redelivered webhook / success-page self-heal: retries any email that
    // didn't go out the first time (each one still sends only once)
    afterResponse(() => sendPaymentEmails(payment.id))
    return { handled: true, idempotent: true }
  }
  if (payment.status !== 'PENDING') {
    return { handled: false, reason: `payment-already-${payment.status.toLowerCase()}` }
  }

  const intentId = paymentIntentId(session.payment_intent)

  try {
    let granted = false
    /** open offers closed because this purchase sold the exclusive */
    let closedByExclusive: string[] = []
    await prisma.$transaction(async tx => {
      const beat = await tx.beat.findUnique({ where: { id: payment.beatId } })
      if (!beat) throw new UnpurchaseableError('Beat no longer exists')
      if (payment.licenseType === 'EXCLUSIVE' && beat.exclusiveSold) {
        throw new UnpurchaseableError('Exclusive license already sold')
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'SUCCEEDED', stripePaymentIntentId: intentId },
      })

      try {
        await tx.license.create({
          data: {
            beatId: payment.beatId,
            artistId: payment.artistId,
            licenseType: payment.licenseType,
            pricePaidCents: payment.amountCents,
            paymentId: payment.id,
            offerId: payment.offerId,
          },
        })
        granted = true
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          // artist already owns this license (paid twice for the same type)
          return
        }
        throw error
      }

      if (payment.offerId) {
        await tx.offer.updateMany({
          where: { id: payment.offerId, status: { in: [...WAITING_OFFER_STATUSES] } },
          data: { status: 'PAID', expiresAt: null },
        })
      }

      if (payment.licenseType === 'EXCLUSIVE') {
        await tx.beat.update({ where: { id: payment.beatId }, data: { exclusiveSold: true } })
        const closed = await tx.offer.updateManyAndReturn({
          where: {
            beatId: payment.beatId,
            id: { not: payment.offerId ?? '' },
            status: { in: [...WAITING_OFFER_STATUSES] },
          },
          data: { status: 'DECLINED', expiresAt: null },
          select: { id: true },
        })
        closedByExclusive = closed.map(offer => offer.id)
      }
    })

    // Prompt 15: emails go out after the transaction commits and never affect
    // the result (receipt + sale notice send once, even on redelivery)
    afterResponse(() => sendPaymentEmails(payment.id))
    if (closedByExclusive.length > 0) {
      const ids = closedByExclusive
      afterResponse(() => sendExclusiveSoldEmails(ids))
    }

    // engagement: library addition, recorded server-side so it also covers
    // grants delivered through the webhook while the artist is away.
    if (granted) {
      void recordEngagementEvent(payment.artistId, payment.beatId, 'BUY').catch(err =>
        console.warn('BUY event record failed', err)
      )
    }
    return { handled: true }
  } catch (error) {
    if (error instanceof UnpurchaseableError) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } })
      const stripe = getStripe()
      if (stripe && intentId) {
        try {
          await stripe.refunds.create({ payment_intent: intentId })
          await prisma.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } })
        } catch (refundError) {
          console.error('Refund failed:', refundError)
          return { handled: true, refunded: false, reason: error.message }
        }
      }
      return { handled: true, refunded: true, reason: error.message }
    }
    throw error
  }
}
