import { NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'
import { getParticipant } from '@/lib/messaging'

/**
 * POST /api/conversations/[id]/read — sets the current user's lastReadAt to
 * now, clearing that conversation's unread badge for them.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified

  const { id } = await ctx.params
  const participant = await getParticipant(id, verified.userId)
  if (!participant) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId: id, userId: verified.userId } },
    data: { lastReadAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
