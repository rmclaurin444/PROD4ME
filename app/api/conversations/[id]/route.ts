import { NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'
import { getParticipant } from '@/lib/messaging'

/**
 * DELETE /api/conversations/[id] — hides the conversation for the current
 * user only (hiddenAt). The other participant keeps it, and a new message
 * from either side un-hides it.
 */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified

  const { id } = await ctx.params
  const participant = await getParticipant(id, verified.userId)
  if (!participant) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  await prisma.conversationParticipant.update({
    where: { conversationId_userId: { conversationId: id, userId: verified.userId } },
    data: { hiddenAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
