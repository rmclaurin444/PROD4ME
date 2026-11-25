import { NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'
import {
  avatarUrl,
  blockedEitherDirection,
  findOrCreateConversation,
  unreadCountsByConversation,
} from '@/lib/messaging'

/**
 * GET /api/conversations — the user's conversations that aren't hidden,
 * newest activity first, each with the other person, the last message
 * preview, and an unread count (their messages after my lastReadAt).
 */
export async function GET() {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified
  const me = verified.userId

  const rows = await prisma.conversationParticipant.findMany({
    where: { userId: me, hiddenAt: null },
    include: {
      conversation: {
        include: {
          participants: {
            include: { user: { select: { id: true, name: true, username: true, avatar: true } } },
          },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
    },
    orderBy: { conversation: { lastMessageAt: 'desc' } },
  })

  const unread = await unreadCountsByConversation(me)

  const conversations = rows
    .map(row => {
      const other = row.conversation.participants.find(p => p.userId !== me)?.user
      if (!other) return null
      const last = row.conversation.messages[0]
      return {
        id: row.conversation.id,
        lastMessageAt: row.conversation.lastMessageAt.toISOString(),
        unreadCount: unread.get(row.conversation.id) ?? 0,
        other: {
          id: other.id,
          name: other.name,
          username: other.username,
          avatarUrl: avatarUrl(other.avatar),
        },
        lastMessage: last
          ? {
              body: last.body,
              senderId: last.senderId,
              createdAt: last.createdAt.toISOString(),
              hasBeat: last.beatId !== null,
            }
          : null,
      }
    })
    .filter(Boolean)

  return NextResponse.json({ conversations })
}

/**
 * POST /api/conversations { userId } — returns the existing one-on-one
 * conversation with that user or creates one. 403 when either side blocked
 * the other; messaging yourself is rejected.
 */
export async function POST(request: Request) {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified
  const me = verified.userId

  let body: { userId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const otherId = typeof body.userId === 'string' ? body.userId : ''
  if (!otherId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  }
  if (otherId === me) {
    return NextResponse.json({ error: "You can't message yourself" }, { status: 400 })
  }

  const other = await prisma.user.findUnique({
    where: { id: otherId },
    select: { id: true, name: true, username: true, avatar: true },
  })
  if (!other) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (await blockedEitherDirection(me, otherId)) {
    return NextResponse.json({ error: "You can't message this user" }, { status: 403 })
  }

  const id = await findOrCreateConversation(me, otherId)

  return NextResponse.json({
    conversation: {
      id,
      other: {
        id: other.id,
        name: other.name,
        username: other.username,
        avatarUrl: avatarUrl(other.avatar),
      },
    },
  })
}
