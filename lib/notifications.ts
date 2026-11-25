import { prisma } from './prisma.ts'
import { formatMoney } from './money.ts'

/**
 * Notifications built from existing rows (no notification table):
 *  - engagement on the user's beats (producers) from EngagementEvent,
 *    grouped per (type, beat) — "Kai Rivers and 4 others liked NIGHTSHIFT"
 *  - offer activity from Offer status transitions (each side only sees what
 *    it couldn't have watched happen)
 *  - direct licenses (no offer attached) for producers — someone bought or
 *    free-claimed the beat without negotiating
 *
 * Unread is derived from `User.notificationsSeenAt`; opening the
 * Notifications tab sets it to now (POST on the same route).
 */

/** Client maps these to icons — never send React components through JSON. */
/** Client maps these to icons — never send React components through JSON. */
export type NotificationType =
  | 'LIKE'
  | 'SAVE'
  | 'COMMENT'
  | 'SHARE'
  | 'FOLLOW'
  | 'NEW_OFFER'
  | 'OFFER_COUNTERED'
  | 'OFFER_ACCEPTED'
  | 'OFFER_DECLINED'
  | 'OFFER_PAID'
  | 'OFFER_EXPIRED'
  | 'LICENSE'
export type NotificationAction =
  | { kind: 'beat'; beatId: string }
  | { kind: 'offers' }
  | { kind: 'profile'; username: string }

export type NotificationItem = {
  /** Stable key for React lists and click routing. */
  id: string
  type: NotificationType
  text: string
  createdAt: string
  unread: boolean
  action: NotificationAction
}

const PAGE_SIZE = 50
/** Engagement events scanned before grouping (groups collapse many rows). */
const ENGAGEMENT_SCAN = 200
const OFFER_SCAN = 60
const LICENSE_SCAN = 60

const ENGAGEMENT_TYPES = ['LIKE', 'COMMENT', 'SAVE', 'SHARE'] as const

/** "Kai Rivers", "Kai Rivers and Nia Saint", "Kai Rivers and 4 others" */
function actorNames(names: string[], total: number): string {
  const first = names[0] ?? 'Someone'
  if (total <= 1) return first
  if (total === 2 && names[1]) return `${first} and ${names[1]}`
  const others = total - 1
  return `${first} and ${others} other${others === 1 ? '' : 's'}`
}

function unreadFlag(at: Date, seenAt: Date | null): boolean {
  return seenAt === null || at.getTime() > seenAt.getTime()
}

function iso(at: Date): string {
  return at.toISOString()
}

type Built = Omit<NotificationItem, 'unread' | 'createdAt'> & { at: Date }

async function buildEngagementItems(producerId: string): Promise<Built[]> {
  const events = await prisma.engagementEvent.findMany({
    where: {
      beat: { producerId },
      userId: { not: producerId },
      type: { in: [...ENGAGEMENT_TYPES] },
    },
    orderBy: { createdAt: 'desc' },
    take: ENGAGEMENT_SCAN,
    select: {
      type: true,
      createdAt: true,
      userId: true,
      user: { select: { name: true } },
      beat: { select: { id: true, title: true } },
    },
  })

  // group per (type, beat): distinct actors, newest event wins the timestamp
  const groups = new Map<
    string,
    { type: string; beatId: string; beatTitle: string; names: string[]; seen: Set<string>; at: Date }
  >()
  for (const e of events) {
    const key = `${e.type}:${e.beat.id}`
    const group = groups.get(key)
    if (group) {
      if (!group.seen.has(e.userId)) {
        group.seen.add(e.userId)
        if (group.names.length < 2) group.names.push(e.user.name)
      }
    } else {
      groups.set(key, {
        type: e.type,
        beatId: e.beat.id,
        beatTitle: e.beat.title,
        names: [e.user.name],
        seen: new Set([e.userId]),
        at: e.createdAt,
      })
    }
  }

  const items: Built[] = []
  for (const group of groups.values()) {
    const who = actorNames(group.names, group.seen.size)
    const verb = {
      LIKE: `liked ${group.beatTitle}`,
      SAVE: `saved ${group.beatTitle}`,
      COMMENT: `commented on ${group.beatTitle}`,
      SHARE: `shared ${group.beatTitle}`,
    }[group.type]
    items.push({
      id: `engagement:${group.type}:${group.beatId}`,
      type: group.type as NotificationType,
      text: `${who} ${verb}.`,
      at: group.at,
      action: { kind: 'beat', beatId: group.beatId },
    })
  }
  return items
}

/**
 * "started following you" notifications come from Follow rows (Prompt 13)
 * — grouped: "Kai Rivers and 3 others started following you". Opens the
 * latest follower's profile.
 */
async function buildFollowItems(meId: string): Promise<Built[]> {
  const follows = await prisma.follow.findMany({
    where: { followingId: meId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      createdAt: true,
      follower: { select: { id: true, name: true, username: true } },
    },
  })

  if (follows.length === 0) return []

  const names: string[] = []
  const seen = new Set<string>()
  let latestUsername = ''
  for (const row of follows) {
    if (!seen.has(row.follower.id)) {
      seen.add(row.follower.id)
      if (names.length < 2) names.push(row.follower.name)
    }
  }
  latestUsername = follows[0]!.follower.username

  const who = actorNames(names, seen.size)
  return [
    {
      id: `follow:${follows[0]!.createdAt.toISOString()}`,
      type: 'FOLLOW',
      text: `${who} started following you.`,
      at: follows[0]!.createdAt,
      action: { kind: 'profile', username: latestUsername },
    },
  ]
}

/** One item per status transition the recipient couldn't have watched. */
async function buildOfferItems(userId: string, role: 'PRODUCER' | 'ARTIST'): Promise<Built[]> {
  const offers = await prisma.offer.findMany({
    where: role === 'PRODUCER' ? { producerId: userId } : { artistId: userId },
    orderBy: { updatedAt: 'desc' },
    take: OFFER_SCAN,
    select: {
      id: true,
      status: true,
      amountCents: true,
      counterAmountCents: true,
      agreedAmountCents: true,
      createdAt: true,
      updatedAt: true,
      beat: { select: { id: true, title: true } },
      artist: { select: { name: true } },
      producer: { select: { name: true } },
    },
  })

  const items: Built[] = []
  for (const offer of offers) {
    const beatTitle = offer.beat.title
    const wasCountered = offer.counterAmountCents !== null
    // the artist accepting a counter lands on AWAITING_PAYMENT with the
    // agreed amount equal to the counter — the only crossroads that matters
    const counterAccepted =
      offer.agreedAmountCents !== null &&
      offer.counterAmountCents !== null &&
      offer.agreedAmountCents === offer.counterAmountCents

    if (role === 'PRODUCER') {
      const artist = offer.artist.name
      switch (offer.status) {
        case 'PENDING':
          items.push({
            id: `offer:${offer.id}:PENDING`,
            type: 'NEW_OFFER',
            text: `New offer on ${beatTitle}: ${formatMoney(offer.amountCents)} from ${artist}.`,
            at: offer.createdAt,
            action: { kind: 'offers' },
          })
          break
        case 'AWAITING_PAYMENT':
          if (counterAccepted) {
            items.push({
              id: `offer:${offer.id}:AWAITING_PAYMENT`,
              type: 'OFFER_ACCEPTED',
              text: `${artist} accepted your counter on ${beatTitle} — awaiting payment.`,
              at: offer.updatedAt,
              action: { kind: 'offers' },
            })
          }
          break
        case 'PAID':
          items.push({
            id: `offer:${offer.id}:PAID`,
            type: 'OFFER_PAID',
            text: `${artist} paid ${formatMoney(offer.agreedAmountCents ?? offer.amountCents)} for ${beatTitle}.`,
            at: offer.updatedAt,
            action: { kind: 'offers' },
          })
          break
        case 'DECLINED':
          // counterAmountCents set → the artist declined the counter;
          // a plain decline was the producer's own action — no self-notice.
          if (wasCountered) {
            items.push({
              id: `offer:${offer.id}:DECLINED`,
              type: 'OFFER_DECLINED',
              text: `${artist} declined your counter on ${beatTitle}.`,
              at: offer.updatedAt,
              action: { kind: 'offers' },
            })
          }
          break
        case 'EXPIRED':
          // expiry nulls expiresAt, so the prior waiting status is inferred:
          // agreed amount → the artist never paid; otherwise a counter died.
          if (wasCountered) {
            items.push({
              id: `offer:${offer.id}:EXPIRED`,
              type: 'OFFER_EXPIRED',
              text:
                offer.agreedAmountCents !== null
                  ? `The agreed sale for ${beatTitle} expired — payment was not completed.`
                  : `Your counter on ${beatTitle} expired.`,
              at: offer.updatedAt,
              action: { kind: 'offers' },
            })
          }
          break
      }
    } else {
      const producer = offer.producer.name
      switch (offer.status) {
        case 'COUNTERED':
          items.push({
            id: `offer:${offer.id}:COUNTERED`,
            type: 'OFFER_COUNTERED',
            text: `${producer} countered your offer on ${beatTitle}: ${formatMoney(offer.counterAmountCents ?? 0)}.`,
            at: offer.updatedAt,
            action: { kind: 'offers' },
          })
          break
        case 'AWAITING_PAYMENT':
          if (!counterAccepted) {
            items.push({
              id: `offer:${offer.id}:AWAITING_PAYMENT`,
              type: 'OFFER_ACCEPTED',
              text: `${producer} accepted your offer on ${beatTitle}.`,
              at: offer.updatedAt,
              action: { kind: 'offers' },
            })
          }
          break
        case 'DECLINED':
          // counterAmountCents set → the artist declined the counter
          // (their own action); a plain decline was the producer's.
          if (!wasCountered) {
            items.push({
              id: `offer:${offer.id}:DECLINED`,
              type: 'OFFER_DECLINED',
              text: `${producer} declined your offer on ${beatTitle}.`,
              at: offer.updatedAt,
              action: { kind: 'offers' },
            })
          }
          break
        case 'EXPIRED':
          if (!wasCountered) {
            items.push({
              id: `offer:${offer.id}:EXPIRED`,
              type: 'OFFER_EXPIRED',
              text: `Your offer for ${beatTitle} expired.`,
              at: offer.updatedAt,
              action: { kind: 'offers' },
            })
          }
          break
      }
    }
  }
  return items
}

/** Direct licenses (no offer) for producers — buys and free claims. */
async function buildLicenseItems(producerId: string): Promise<Built[]> {
  const licenses = await prisma.license.findMany({
    where: { beat: { producerId }, offerId: null },
    orderBy: { createdAt: 'desc' },
    take: LICENSE_SCAN,
    select: {
      id: true,
      paymentId: true,
      createdAt: true,
      beat: { select: { id: true, title: true } },
    },
  })

  return licenses.map(license => ({
    id: `license:${license.id}`,
    type: 'LICENSE' as const,
    text:
      license.paymentId === null
        ? `Someone claimed a free license for ${license.beat.title}.`
        : `Someone licensed ${license.beat.title}.`,
    at: license.createdAt,
    action: { kind: 'offers' } as const,
  }))
}

export async function getNotifications(userId: string, role: string): Promise<{
  items: NotificationItem[]
  unreadCount: number
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationsSeenAt: true },
  })
  const seenAt = user?.notificationsSeenAt ?? null

  const sources: Promise<Built[]>[] = [
    buildOfferItems(userId, role === 'ARTIST' ? 'ARTIST' : 'PRODUCER'),
    buildFollowItems(userId),
  ]
  if (role === 'PRODUCER') {
    sources.push(buildEngagementItems(userId), buildLicenseItems(userId))
  }

  const built = (await Promise.all(sources)).flat()
  built.sort((a, b) => b.at.getTime() - a.at.getTime())

  const items: NotificationItem[] = built.slice(0, PAGE_SIZE).map(entry => ({
    id: entry.id,
    type: entry.type,
    text: entry.text,
    createdAt: iso(entry.at),
    unread: unreadFlag(entry.at, seenAt),
    action: entry.action,
  }))

  return { items, unreadCount: items.filter(item => item.unread).length }
}

/** Opening the Notifications tab: everything currently visible is read. */
export async function markNotificationsSeen(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { notificationsSeenAt: new Date() },
  })
}
