import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { phoneEnabled, checkPhoneVerification } from '@/lib/sms'
import { devCodeHash } from '@/lib/sms'

/**
 * POST /api/account/phone/verify — { code }
 *
 * Confirms the code for the logged-in user's current phone number and marks
 * `phoneVerifiedAt`. Twilio Verify when configured; otherwise the dev code
 * stored by POST /api/account/phone.
 */
export async function POST(request: Request) {
  const authed = await requireVerifiedUser()
  if (authed instanceof NextResponse) return authed

  if (!phoneEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const user = await prisma.user.findUnique({
    where: { id: authed.userId },
    select: { id: true, phone: true },
  })
  if (!user?.phone) {
    return NextResponse.json({ error: 'No phone number on the account' }, { status: 400 })
  }

  let body: { code?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const code = typeof body.code === 'string' ? body.code.trim() : ''
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Enter the 6-digit code' }, { status: 400 })
  }

  // dev path: match against stored PHONE_VERIFY tokens (10-minute expiry),
  // max 5 attempts per token window
  const recentTokens = await prisma.verificationToken.count({
    where: {
      userId: user.id,
      kind: 'PHONE_VERIFY',
      target: user.phone,
      createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
    },
  })
  if (recentTokens === 0) {
    return NextResponse.json(
      { error: 'No verification in progress — request a new code.' },
      { status: 400 }
    )
  }
  if (recentTokens > 5) {
    return NextResponse.json({ error: 'Too many attempts — request a new code.' }, { status: 429 })
  }

  const devMatch = await prisma.verificationToken.findFirst({
    where: {
      userId: user.id,
      kind: 'PHONE_VERIFY',
      target: user.phone,
      tokenHash: devCodeHash(user.phone, code),
      expiresAt: { gt: new Date() },
      usedAt: null,
    },
    select: { id: true },
  })

  if (sid_configured()) {
    const ok = await checkPhoneVerification(user.phone, code)
    if (!ok) return NextResponse.json({ error: 'Incorrect code' }, { status: 400 })
    await prisma.user.update({
      where: { id: user.id },
      data: { phoneVerifiedAt: new Date() },
    })
    return NextResponse.json({ ok: true })
  }

  if (!devMatch) {
    return NextResponse.json({ error: 'Incorrect code' }, { status: 400 })
  }
  await prisma.verificationToken.update({
    where: { id: devMatch.id },
    data: { usedAt: new Date() },
  })
  await prisma.user.update({
    where: { id: user.id },
    data: { phoneVerifiedAt: new Date() },
  })
  return NextResponse.json({ ok: true })
}

function sid_configured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_VERIFY_SERVICE_SID
  )
}
