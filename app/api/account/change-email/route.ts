import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { issueVerificationToken } from '@/lib/verification-token'
import { EMAIL_TEMPLATES, sendEmail } from '@/lib/email'

/** POST /api/account/change-email — { newEmail, currentPassword }
 *
 * Sets `pendingEmail` and emails an EMAIL_CHANGE link to the NEW address.
 * The email switches only after that link is clicked (confirm-email-change). */
export async function POST(request: Request) {
  const authed = await requireVerifiedUser()
  if (authed instanceof NextResponse) return authed

  const user = await prisma.user.findUnique({
    where: { id: authed.userId },
    select: { id: true, email: true, password: true, pendingEmail: true },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { newEmail?: unknown; currentPassword?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const newEmail =
    typeof body.newEmail === 'string' ? body.newEmail.trim().toLowerCase() : ''
  if (!newEmail.includes('@')) {
    return NextResponse.json({ error: 'A valid new email is required' }, { status: 400 })
  }

  const match = await bcrypt.compare(
    typeof body.currentPassword === 'string' ? body.currentPassword : '',
    user.password
  )
  if (!match) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 403 })
  }

  if (newEmail === user.email) {
    return NextResponse.json({ error: 'That is already your email' }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email: newEmail } })
  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 400 })
  }

  await prisma.user.update({ where: { id: user.id }, data: { pendingEmail: newEmail } })

  const token = await issueVerificationToken(user.id, 'EMAIL_CHANGE', newEmail, 24 * 60 * 60 * 1000)
  const origin = request.headers.get('origin') ?? 'http://localhost:3000'
  const link = `${origin}/verify-email?token=${token}&change=1`

  try {
    await sendEmail({ to: newEmail, ...EMAIL_TEMPLATES.confirmEmailChange(link, newEmail) })
  } catch (error) {
    console.error('Change-email error:', error)
    return NextResponse.json({ error: 'Could not send the confirmation email' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, pendingEmail: newEmail })
}
