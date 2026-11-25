import Stripe from 'stripe'

let stripe: Stripe | null = null

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  if (!stripe) stripe = new Stripe(key)
  return stripe
}

export function stripeConfigError(): string | null {
  return process.env.STRIPE_SECRET_KEY
    ? null
    : 'Stripe is not configured. Add STRIPE_SECRET_KEY to .env.local (test mode keys).'
}

/** True while the secret key is a Stripe test key (sk_test_…). */
export function isStripeTestMode(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'))
}
