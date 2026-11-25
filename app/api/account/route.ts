import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { phoneEnabled } from '@/lib/sms'

/** Current account for the Settings page. */
export async function GET() {
  const authed = await requireVerifiedUser()
  if (authed instanceof NextResponse) return authed

  const user = await prisma.user.findUnique({
    where: { id: authed.userId },
    select: {
      username: true,
      email: true,
      pendingEmail: true,
      emailVerifiedAt: true,
      phone: true,
      phoneVerifiedAt: true,
      passwordChangedAt: true,
      role: true,
      emailOffers: true,
      emailSales: true,
    },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({
    username: user.username,
    email: user.email,
    pendingEmail: user.pendingEmail,
    emailVerified: !!user.emailVerifiedAt,
    phone: user.phone,
    phoneVerified: !!user.phoneVerifiedAt,
    passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
    phoneEnabled: phoneEnabled(),
    role: user.role,
    emailOffers: user.emailOffers,
    emailSales: user.emailSales,
  })
}
