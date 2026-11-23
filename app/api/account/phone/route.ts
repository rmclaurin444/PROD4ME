import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { phoneEnabled, startPhoneVerification, devCodeHash } from '@/lib/sms'
import { normalizePhone, phoneError } from '@/lib/username'

/**
 * POST /api/account/phone — { phone, currentPassword }
 *
 * Adds or replaces the phone number (requires the current password). The
 * number is unverified until the code is entered (POST /api/account/phone/verify).
 */
export async function POST(request: Request) {
  const authed = await requireVerifiedUser()
  if (authed instanceof NextResponse) return authed

  if (!phoneEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const user = await prisma.user.findUnique({
    where: { id: authed.userId },
    select: { id: true, password: true },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { phone?: unknown; currentPassword?: unknown }
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

  const raw = typeof body.phone === 'string' ? body.phone : ''
  const pErr = phoneError(raw)
  if (pErr) return NextResponse.json({ error: pErr }, { status: 400 })
  const phone = normalizePhone(raw)
  if (!phone) return NextResponse.json({ error: 'Enter a valid phone number' }, { status: 400 })

  const existing = await prisma.user.findUnique({ where: { phone } })
  if (existing && existing.id !== user.id) {
    return NextResponse.json({ error: 'An account with this phone already exists' }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { phone, phoneVerifiedAt: null },
  })

  const { devCode } = await startPhoneVerification(phone)

  // dev fallback: store the code so POST /api/account/phone/verify can check it
  if (devCode) {
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        kind: 'PHONE_VERIFY',
        tokenHash: devCodeHash(phone, devCode),
        target: phone,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    })
    return NextResponse.json({ ok: true, devCode })
  }

  return NextResponse.json({ ok: true })
}
/** DELETE /api/account/phone — { currentPassword }
 * Removes the phone number (requires the current password). */
export async function DELETE(request: Request) {
  const authed = await requireVerifiedUser()
  if (authed instanceof NextResponse) return authed
  if (!phoneEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const user = await prisma.user.findUnique({
    where: { id: authed.userId },
    select: { id: true, password: true, phone: true },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.phone) {
    return NextResponse.json({ error: 'No phone number on the account' }, { status: 400 })
  }
  let body: { currentPassword?: unknown }
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
  await prisma.user.update({
    where: { id: user.id },
    data: { phone: null, phoneVerifiedAt: null },
  })
  return NextResponse.json({ ok: true })
}
