import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

/**
 * API gate for the email-verification requirement (proxy.ts only covers
 * pages). Returns a NextResponse to short-circuit with, or the verified
 * session when the caller may proceed.
 */
export type VerifiedSession = {
  userId: string
  role: string
  email: string
}

export async function requireVerifiedUser(): Promise<NextResponse | VerifiedSession> {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // session.user.emailVerified comes from the JWT; a stale `false` is
  // re-checked against the database so users who just verified get through.
  if (session.user.emailVerified === false) {
    const { prisma } = await import('@/lib/prisma')
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { emailVerifiedAt: true },
    })
    if (!user?.emailVerifiedAt) {
      return NextResponse.json({ error: 'Verify your email to continue' }, { status: 403 })
    }
  }

  return {
    userId: session.user.id,
    role: session.user.role as string,
    email: session.user.email as string,
  }
}
