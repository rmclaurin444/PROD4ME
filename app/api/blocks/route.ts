import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'
import { removeFollowsBetween } from '@/lib/follows'

/**
 * POST /api/blocks { userId } — blocks a user. Idempotent: blocking an
 * already-blocked user succeeds without a second row. Blocking yourself is
 * rejected. Blocking removes follows in BOTH directions (Prompt 13).
 */
export async function POST(request: Request) {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified

  let body: { userId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const blockedId = typeof body.userId === 'string' ? body.userId : ''
  if (!blockedId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }
  if (blockedId === verified.userId) {
    return NextResponse.json({ error: "You can't block yourself" }, { status: 400 })
  }

  const target = await prisma.user.findUnique({ where: { id: blockedId }, select: { id: true } })
  if (!target) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  try {
    await prisma.block.create({
      data: { blockerId: verified.userId, blockedId },
    })
    // Prompt 13: blocked users can't follow each other — drop existing follows
    await removeFollowsBetween(verified.userId, blockedId)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      await removeFollowsBetween(verified.userId, blockedId).catch(() => {})
      return NextResponse.json({ ok: true, alreadyBlocked: true })
    }
    throw error
  }

  return NextResponse.json({ ok: true })
}
