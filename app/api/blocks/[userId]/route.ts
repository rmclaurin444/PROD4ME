import { NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'

/**
 * DELETE /api/blocks/[userId] — unblocks a user (removes the block the
 * current user created). Unblocking someone who isn't blocked is a no-op.
 */
export async function DELETE(_request: Request, ctx: { params: Promise<{ userId: string }> }) {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified

  const { userId } = await ctx.params
  await prisma.block.deleteMany({
    where: { blockerId: verified.userId, blockedId: userId },
  })

  return NextResponse.json({ ok: true })
}
