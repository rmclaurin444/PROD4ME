import { NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'
import { unreadCountsByConversation } from '@/lib/messaging'

/**
 * GET /api/messages/unread-count — total unread messages across the user's
 * conversations (their messages after my lastReadAt). Drives the inbox nav
 * badge (added to the notifications unread count).
 */
export async function GET() {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified

  const counts = await unreadCountsByConversation(verified.userId)
  const count = [...counts.values()].reduce((sum, n) => sum + n, 0)

  return NextResponse.json({ count })
}
