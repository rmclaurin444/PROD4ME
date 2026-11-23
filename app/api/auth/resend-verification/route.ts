import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { consumeVerificationToken, countRecentVerifications, issueVerificationToken } from '@/lib/verification-token'
import { EMAIL_TEMPLATES, sendEmail } from '@/lib/email'

const RESEND_WINDOW_MS = 60 * 60 * 1000
const RESEND_LIMIT = 3

/** Re-sends the email-verification link to the logged-in user's address. */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // signup → verification flow: brand-new users are still unverified here
  const { emailVerifiedAt } =
    (await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { emailVerifiedAt: true },
    })) ?? {}

  const recent = await countRecentVerifications(session.user.id, 'EMAIL_VERIFY', RESEND_WINDOW_MS)
  if (recent >= RESEND_LIMIT) {
    return NextResponse.json(
      { error: 'Too many verification emails — try again later.' },
      { status: 429 }
    )
  }

  // already-verified callers go straight to the app
  if (emailVerifiedAt) {
    return NextResponse.json({ verified: true })
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const token = await issueVerificationToken(user.id, 'EMAIL_VERIFY', user.email, 24 * 60 * 60 * 1000)
  const origin = request.headers.get('origin') ?? 'http://localhost:3000'
  const link = `${origin}/verify-email?token=${token}`

  try {
    await sendEmail({ to: user.email, ...EMAIL_TEMPLATES.verifyEmail(link) })
  } catch (error) {
    console.error('Resend verification error:', error)
    return NextResponse.json({ error: 'Could not send the verification email' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
