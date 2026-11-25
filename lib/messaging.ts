import { prisma } from './prisma.ts'
import { publicUrl, BUCKET_ARTWORK } from './storage.ts'
import { MESSAGES_PER_MINUTE } from './messaging/constants.ts'
import { checkRateLimit } from './rate-limit.ts'

/**
 * Server-side messaging helpers: avatar URL shaping, the race-safe
 * find-or-create for one-on-one conversations, block checks, and the
 * per-user send rate limiter.
 */

export type ShapedMessageUser = {
  id: string
  name: string
  username: string
  role: string
  avatarUrl: string | null
}

export type ShapedMessageBeat = {
  id: string
  title: string
  producer: string
  price: number
  artUrl: string | null
  artPreset: string | null
}

export type ShapedMessage = {
  id: string
  body: string
  senderId: string
  createdAt: string
  beat: ShapedMessageBeat | null
}

export type ShapedConversation = {
  id: string
  lastMessageAt: string
  unreadCount: number
  other: ShapedMessageUser
  lastMessage: { body: string; senderId: string; createdAt: string; hasBeat: boolean } | null
}

export function avatarUrl(avatarKey: string | null | undefined): string | null {
  return avatarKey ? publicUrl(BUCKET_ARTWORK, avatarKey) : null
}

/** Deterministic pair key — both call orders map to the same advisory lock. */
function conversationLockKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

/** True when a block exists in EITHER direction between the two users. */
export async function blockedEitherDirection(a: string, b: string): Promise<boolean> {
  const count = await prisma.block.count({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
  })
  return count > 0
}

/** The one-on-one conversation between two users (exactly two participants), or null. */
function findConversationIdBetween(a: string, b: string): Promise<{ id: string }[]> {
  return prisma.$queryRaw<Array<{ id: string }>>`
    SELECT c."id"
    FROM "Conversation" c
    JOIN "ConversationParticipant" p1 ON p1."conversationId" = c."id" AND p1."userId" = ${a}
    JOIN "ConversationParticipant" p2 ON p2."conversationId" = c."id" AND p2."userId" = ${b}
    WHERE (SELECT COUNT(*) FROM "ConversationParticipant" cp WHERE cp."conversationId" = c."id") = 2
    LIMIT 1`
}

/**
 * Find-or-create the one-on-one conversation, serialized per user pair with
 * a transaction-scoped advisory lock so two simultaneous sends can't create
 * duplicate conversations.
 */
export async function findOrCreateConversation(a: string, b: string): Promise<string> {
  const [lockA, lockB] = conversationLockKey(a, b)
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockA}), hashtext(${lockB}))`
    const existing = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT c."id"
      FROM "Conversation" c
      JOIN "ConversationParticipant" p1 ON p1."conversationId" = c."id" AND p1."userId" = ${a}
      JOIN "ConversationParticipant" p2 ON p2."conversationId" = c."id" AND p2."userId" = ${b}
      WHERE (SELECT COUNT(*) FROM "ConversationParticipant" cp WHERE cp."conversationId" = c."id") = 2
      LIMIT 1`
    if (existing.length > 0) return existing[0].id
    const created = await tx.conversation.create({
      data: {
        participants: { create: [{ userId: a }, { userId: b }] },
      },
      select: { id: true },
    })
    return created.id
  })
}

/** Participant check for a conversation route — null when not a member. */
export async function getParticipant(conversationId: string, userId: string) {
  return prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
    select: { conversationId: true, lastReadAt: true, hiddenAt: true },
  })
}

/** Per-user send rate limit, Postgres-backed (lib/rate-limit.ts). */
export async function sendRateLimited(userId: string): Promise<boolean> {
  const { ok } = await checkRateLimit(`msg:${userId}`, MESSAGES_PER_MINUTE, 60_000)
  return !ok
}

/** Unread counts per conversation for one user, in one query. */
export async function unreadCountsByConversation(userId: string): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<Array<{ conversationId: string; n: bigint }>>`
    SELECT m."conversationId", COUNT(*)::bigint AS n
    FROM "Message" m
    JOIN "ConversationParticipant" cp
      ON cp."conversationId" = m."conversationId" AND cp."userId" = ${userId}
    WHERE m."senderId" <> ${userId}
      AND m."createdAt" > COALESCE(cp."lastReadAt", to_timestamp(0))
    GROUP BY m."conversationId"`
  return new Map(rows.map(row => [row.conversationId, Number(row.n)]))
}
