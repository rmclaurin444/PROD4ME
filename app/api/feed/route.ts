import { NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { prisma } from '@/lib/prisma'
import { FeedTagNotFoundError, getFeedPage, getFollowingPage } from '@/lib/recommendations/feed.ts'

/**
 * Personalized feed.
 *   GET /api/feed                      → For You (FEED_PAGE_SIZE shaped beats)
 *   GET /api/feed?cursor=<token>       → next For You page (no repeat beats)
 *   GET /api/feed?tag=<name>           → tag-scoped feed (404 when tag is unknown)
 *   GET /api/feed?refresh=1            → a freshly shuffled page (weighted sample
 *                                        of the top candidates; counts toward the
 *                                        "Feed refreshes" analytics)
 *   GET /api/feed?mode=following       → Prompt 13: chronological beats from
 *                                        producers the user follows (own cursor
 *                                        format; no 7-day exclusion, no ranking;
 *                                        beats newer than followingFeedSeenAt
 *                                        carry isNew: true)
 *
 * `caughtUp: true` in the response marks fallback pages where nothing new
 * was left and previously-seen beats are being replayed.
 *
 * 401 when unauthenticated; everything else is server-side per the
 * recommendation rules (lib/recommendations/**).
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified
  const userId = verified.userId

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor')
  const tag = searchParams.get('tag')
  const refresh = searchParams.get('refresh') === '1'
  const mode = searchParams.get('mode') === 'following' ? 'following' : 'foryou'

  try {
    if (mode === 'following') {
      const seenAt = (
        await prisma.user.findUnique({
          where: { id: userId },
          select: { followingFeedSeenAt: true },
        })
      )?.followingFeedSeenAt ?? null
      const page = await getFollowingPage(userId, { cursor, seenAt })
      return NextResponse.json(page)
    }

    const page = await getFeedPage(userId, { cursor, tag, refresh })
    if (refresh) {
      // lightweight analytics count only — not an engagement event, never a
      // recommendation signal (fire-and-forget: a failure must not break the
      // feed response)
      void prisma.feedRefresh
        .create({ data: { userId } })
        .catch(err => console.warn('feed refresh tracking failed', err))
    }
    return NextResponse.json(page)
  } catch (error) {
    if (error instanceof FeedTagNotFoundError) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }
    console.error('Feed error:', error)
    return NextResponse.json({ error: 'Could not load feed' }, { status: 500 })
  }
}
