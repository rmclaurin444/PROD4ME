import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** Verification status for the pending screen's polling (allowed for
 *  unverified users). */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { emailVerifiedAt: true },
  })

  return NextResponse.json({ verified: !!user?.emailVerifiedAt })
}
