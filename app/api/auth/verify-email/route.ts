import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { consumeVerificationToken } from '@/lib/verification-token'

/** Confirms an EMAIL_VERIFY token: sets emailVerifiedAt and marks the token
 *  used (single use). The JWT refreshes through the client's update() call. */
export async function POST(request: Request) {
  let body: { token?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token : ''
  if (!token) {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 })
  }

  const result = await consumeVerificationToken(token, 'EMAIL_VERIFY')
  if (!result) {
    return NextResponse.json(
      { error: 'This link is invalid, expired, or already used. Send a new link and try again.' },
      { status: 400 }
    )
  }

  const user = await prisma.user.update({
    where: { id: result.userId },
    data: { emailVerifiedAt: new Date() },
    select: { email: true },
  })

  return NextResponse.json({ verified: true, email: user.email })
}
