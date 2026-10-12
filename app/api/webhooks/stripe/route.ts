import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getStripe, stripeConfigError } from '@/lib/stripe'
import { finalizeCheckoutSession } from '@/lib/finalize'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const stripe = getStripe()
  const configError = stripeConfigError()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripe || configError || !webhookSecret) {
    return NextResponse.json(
      { error: 'Stripe webhook is not configured (STRIPE_WEBHOOK_SECRET / STRIPE_SECRET_KEY in .env.local).' },
      { status: 500 }
    )
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: import('stripe').Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(await request.text(), signature, webhookSecret)
  } catch (error) {
    console.error('Webhook signature verification failed:', error)
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const checkoutSession = event.data.object
      const result = await finalizeCheckoutSession(checkoutSession)
      if (!result.handled) console.warn('checkout.session.completed ignored:', result)
      break
    }
    case 'checkout.session.expired': {
      // a lapsed session: mark its pending payment FAILED so "Pay now" can re-issue
      await prisma.payment.updateMany({
        where: { stripeSessionId: event.data.object.id, status: 'PENDING' },
        data: { status: 'FAILED' },
      })
      break
    }
    default:
      break
  }

  return NextResponse.json({ received: true })
}
