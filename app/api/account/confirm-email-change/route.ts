import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { consumeVerificationToken } from '@/lib/verification-token'
import { EMAIL_TEMPLATES, sendEmail } from '@/lib/email'

/** POST /api/account/confirm-email-change — { token }
 *
 * Called from the emailed link: switches the account email to the pending
 * address and notifies the OLD address. Allowed while unverified (the link
 * is the verification). */
export async function POST(request: Request) {
  let body: { token?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token : ''
  if (!token) return NextResponse.json({ error: 'Token is required' }, { status: 400 })

  const result = await consumeVerificationToken(token, 'EMAIL_CHANGE')
  if (!result) {
    return NextResponse.json(
      { error: 'This link is invalid, expired, or already used.' },
      { status: 400 }
    )
  }

  const newEmail = result.target.toLowerCase()
  const user = await prisma.user.findUnique({
    where: { id: result.userId },
    select: { id: true, email: true, emailVerifiedAt: true },
  })
  if (!user) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  const collision = await prisma.user.findUnique({ where: { email: newEmail } })
  if (collision && collision.email !== user.email) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 400 })
  }

  const oldEmail = user.email
  await prisma.user.update({
    where: { id: user.id },
    data: { email: newEmail, pendingEmail: null, emailVerifiedAt: new Date() },
  })

  try {
    await sendEmail({ to: oldEmail, ...EMAIL_TEMPLATES.emailChanged(oldEmail) })
  } catch (error) {
    console.error('Email-changed notice error:', error)
  }

  return NextResponse.json({ ok: true, email: newEmail })
}
