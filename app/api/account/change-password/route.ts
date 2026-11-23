import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { EMAIL_TEMPLATES, sendEmail } from '@/lib/email'

/** POST /api/account/change-password — { currentPassword, newPassword }
 *
 * Sets `passwordChangedAt` and emails a change notice. */
export async function POST(request: Request) {
  const authed = await requireVerifiedUser()
  if (authed instanceof NextResponse) return authed

  const user = await prisma.user.findUnique({
    where: { id: authed.userId },
    select: { id: true, email: true, password: true },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { currentPassword?: unknown; newPassword?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const match = await bcrypt.compare(
    typeof body.currentPassword === 'string' ? body.currentPassword : '',
    user.password
  )
  if (!match) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 403 })
  }

  if (typeof body.newPassword !== 'string' || body.newPassword.length < 8) {
    return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
  }

  const hashed = await bcrypt.hash(body.newPassword, 10)
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, passwordChangedAt: new Date() },
  })

  try {
    await sendEmail({ to: user.email, ...EMAIL_TEMPLATES.passwordChanged() })
  } catch (error) {
    console.error('Password-changed notice error:', error)
  }

  return NextResponse.json({ ok: true })
}
