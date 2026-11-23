import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { isAdmin } from '@/lib/admin'
import { getAnalytics, parseRange } from '@/lib/analytics'

/**
 * Admin-only engagement analytics (Prompt 0: available to admins in EVERY
 * environment — no devPanelEnabled gate here, unlike the dev tools).
 *
 *   GET /api/dev/analytics?range=7d|30d|all&includeDev=1
 *
 * `includeDev=1` adds the dev-* seeded accounts back into the numbers.
 */
export async function GET(request: Request) {
  const session = await auth()
  const userId = session?.user?.id

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const range = parseRange(url.searchParams.get('range'))
  const includeDev = url.searchParams.get('includeDev') === '1'

  try {
    const data = await getAnalytics(range, includeDev)
    // Stripe mode label (test vs live) without leaking the key itself
    const stripeTestMode = (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test_')
    return NextResponse.json({ ...data, stripeTestMode })
  } catch (error) {
    console.error('Analytics error:', error)
    return NextResponse.json({ error: 'Analytics failed' }, { status: 500 })
  }
}

