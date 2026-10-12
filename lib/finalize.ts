import { Prisma } from '@prisma/client'
import type Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import { WAITING_OFFER_STATUSES } from '@/lib/offers'

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
    return { handled: true, idempotent: true }
  }
  if (payment.status !== 'PENDING') {
    return { handled: false, reason: `payment-already-${payment.status.toLowerCase()}` }
  }

  const intentId = paymentIntentId(session.payment_intent)

  try {
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
        await tx.offer.updateMany({
          where: {
            beatId: payment.beatId,
            id: { not: payment.offerId ?? '' },
            status: { in: [...WAITING_OFFER_STATUSES] },
          },
          data: { status: 'DECLINED', expiresAt: null },
        })
      }
    })
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
