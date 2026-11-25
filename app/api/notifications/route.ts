import { NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { getNotifications, markNotificationsSeen } from '@/lib/notifications'

/**
 * GET    — latest 50 notifications for the logged-in user, built from
 *          engagement events, offers, and direct licenses (no new table),
 *          each flagged unread against `User.notificationsSeenAt`.
 * POST   — opening the Notifications tab: marks everything seen (sets
 *          `notificationsSeenAt` to now).
 */
export async function GET() {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified

  const { items, unreadCount } = await getNotifications(verified.userId, verified.role)
  return NextResponse.json({ items, unreadCount })
}

export async function POST() {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified

  await markNotificationsSeen(verified.userId)
  return NextResponse.json({ ok: true })
}
