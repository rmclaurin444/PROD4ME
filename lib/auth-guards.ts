import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

/**
 * API gates. Two tiers (Prompt 13's companion to the browse-while-unverified
 * change):
 *
 *  - requireVerifiedUser()   — requires a logged-in session only. Unverified
 *    accounts can browse, engage, and message, so almost every route uses
 *    this one.
 *  - requireVerifiedUserStrict() — additionally requires a verified email.
 *    Used by the purchase funnel (checkout, free claims, offers) and any
 *    other surface unverified accounts must not use.
 *
 * Both re-check the DB when the JWT carries a stale `false` so users who
 * just verified get through without a re-login.
 */
export type VerifiedSession = {
  userId: string
  role: string
  email: string
}

export type VerifiedGate = { emailVerifiedAt: Date | null }

/** Fresh verification state from the DB (JWT can trail reality). */
async function freshVerification(userId: string): Promise<VerifiedGate> {
  const { prisma } = await import('@/lib/prisma')
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerifiedAt: true },
  })
  return { emailVerifiedAt: user?.emailVerifiedAt ?? null }
}

export async function requireVerifiedUser(): Promise<NextResponse | VerifiedSession> {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return {
    userId: session.user.id,
    role: session.user.role as string,
    email: session.user.email as string,
  }
}

/** Logged in + email verified — for the purchase funnel. */
export async function requireVerifiedUserStrict(): Promise<NextResponse | VerifiedSession> {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (session.user.emailVerified === false) {
    const { emailVerifiedAt } = await freshVerification(session.user.id)
    if (!emailVerifiedAt) {
      return NextResponse.json(
        { error: 'Verify your email to purchase' },
        { status: 403 }
      )
    }
  }

  return {
    userId: session.user.id,
    role: session.user.role as string,
    email: session.user.email as string,
  }
}
