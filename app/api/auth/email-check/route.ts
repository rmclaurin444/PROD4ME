import { NextResponse } from 'next/server'
import { checkEmail, emailCheckMessage } from '@/lib/email-check'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/email-check?email= — on-blur check for the signup and
 * change-email forms. The browser never calls the validator directly. Public
 * (signup is logged out), rate-limited to 20 per minute per IP. Advisory only:
 * register / change-email re-check on submit.
 *
 * 200 { ok, reason?, message?, suggestion? }
 */
export async function GET(request: Request) {
  const { ok: allowed, retryAfterSec } = await checkRateLimit(`emailcheck:${clientIp(request)}`, 20, 60_000)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many checks. Try again in a moment.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
    )
  }

  const email = (new URL(request.url).searchParams.get('email') ?? '').trim().toLowerCase()
  if (!email || email.length > 254) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  const result = await checkEmail(email)
  return NextResponse.json(
    {
      ok: result.ok,
      ...(result.reason ? { reason: result.reason, message: emailCheckMessage(result) } : {}),
      ...(result.suggestion ? { suggestion: result.suggestion } : {}),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
