import { NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'
import { blockedEitherDirection, getParticipant, sendRateLimited } from '@/lib/messaging'
import { publicUrl, BUCKET_ARTWORK } from '@/lib/storage'
import { MESSAGE_MAX_CHARS, MESSAGES_PER_PAGE } from '@/lib/messaging/constants'

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status })
}

/**
 * GET /api/conversations/[id]/messages?before=<messageId> — one page of
 * thread history, oldest → newest within the page. `before` pages back
 * through older history; `after=<messageId>` returns only messages newer
 * than that message (the 4-second poll cursor). Non-participants get 404
 * (existence is not disclosed). The response also carries the block state
 * so the UI can replace the composer.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified
  const me = verified.userId

  const { id } = await ctx.params
  const participant = await getParticipant(id, me)
  if (!participant) return bad('Conversation not found', 404)

  const url = new URL(request.url)
  const beforeId = url.searchParams.get('before')
  const afterId = url.searchParams.get('after')

  let beforeAt: Date | null = null
  if (beforeId) {
    const before = await prisma.message.findUnique({
      where: { id: beforeId },
      select: { conversationId: true, createdAt: true },
    })
    // a cursor from another conversation is just a stale cursor — ignore it
    if (before && before.conversationId === id) beforeAt = before.createdAt
  }

  let afterAt: Date | null = null
  if (afterId) {
    const after = await prisma.message.findUnique({
      where: { id: afterId },
      select: { conversationId: true, createdAt: true },
    })
    if (after && after.conversationId === id) afterAt = after.createdAt
  }

  const rows = await prisma.message.findMany({
    where: {
      conversationId: id,
      ...(beforeAt ? { createdAt: { lt: beforeAt } } : {}),
      ...(afterAt ? { createdAt: { gt: afterAt } } : {}),
    },
    orderBy: afterAt ? { createdAt: 'asc' } : { createdAt: 'desc' },
    take: afterAt ? 100 : MESSAGES_PER_PAGE + 1,
    include: {
      sender: { select: { id: true } },
      beat: {
        include: { producer: { select: { name: true } } },
      },
    },
  })

  // history pages arrive newest-first — flip to oldest→newest;
  // after-pages (poll) are already ascending
  const isHistory = afterAt === null
  const hasMore = isHistory && rows.length > MESSAGES_PER_PAGE
  const trimmed = isHistory ? rows.slice(0, MESSAGES_PER_PAGE) : rows
  const page = [...trimmed].reverse()

  const otherParticipant = await prisma.conversationParticipant.findFirst({
    where: { conversationId: id, userId: { not: me } },
    select: { userId: true },
  })

  return NextResponse.json({
    messages: page.map(message => ({
      id: message.id,
      body: message.body,
      senderId: message.senderId,
      createdAt: message.createdAt.toISOString(),
      beat: message.beat
        ? {
            id: message.beat.id,
            title: message.beat.title,
            producer: message.beat.producer.name,
            price: message.beat.price,
            artUrl: message.beat.artKey
              ? publicUrl(BUCKET_ARTWORK, message.beat.artKey)
              : message.beat.artUrl,
            artPreset: message.beat.artPreset,
          }
        : null,
    })),
    hasMore,
    blocked:
      otherParticipant !== null ? await blockedEitherDirection(me, otherParticipant.userId) : false,
  })
}

/**
 * POST /api/conversations/[id]/messages { body, beatId? } — sends a message
 * (plain text, max 2000 chars, optional shared beat). Blocked in either
 * direction → 403. Bumps lastMessageAt, clears hiddenAt for BOTH
 * participants (a deleted conversation returns with new activity), and is
 * rate limited to 30 sends per minute per user.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified
  const me = verified.userId

  const { id } = await ctx.params
  const participant = await getParticipant(id, me)
  if (!participant) return bad('Conversation not found', 404)

  let body: { body?: unknown; beatId?: unknown }
  try {
    body = await request.json()
  } catch {
    return bad('Invalid request body')
  }

  const text = typeof body.body === 'string' ? body.body.trim() : ''
  const beatId = typeof body.beatId === 'string' && body.beatId.length > 0 ? body.beatId : null

  if (!text && !beatId) return bad('Message is empty')
  if (text.length > MESSAGE_MAX_CHARS) {
    return bad(`Message is too long (max ${MESSAGE_MAX_CHARS} characters)`)
  }

  if (await sendRateLimited(me)) {
    return bad('You are sending messages too quickly. Try again in a moment.', 429)
  }

  let beat: { id: string } | null = null
  if (beatId) {
    beat = await prisma.beat.findUnique({ where: { id: beatId }, select: { id: true } })
    if (!beat) return bad('Beat not found', 404)
  }

  const otherParticipant = await prisma.conversationParticipant.findFirst({
    where: { conversationId: id, userId: { not: me } },
    select: { userId: true },
  })
  if (!otherParticipant) return bad('Conversation not found', 404)
  if (await blockedEitherDirection(me, otherParticipant.userId)) {
    return bad("You can't message this user", 403)
  }

  const now = new Date()
  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: { conversationId: id, senderId: me, body: text, beatId: beat ? beat.id : null },
    }),
    prisma.conversation.update({
      where: { id },
      data: { lastMessageAt: now },
    }),
    // a deleted conversation comes back for both sides on new activity
    prisma.conversationParticipant.updateMany({
      where: { conversationId: id },
      data: { hiddenAt: null },
    }),
  ])

  return NextResponse.json({
    message: {
      id: message.id,
      body: message.body,
      senderId: message.senderId,
      createdAt: message.createdAt.toISOString(),
      beat: beat
        ? { id: beat.id }
        : null,
    },
  })
}
