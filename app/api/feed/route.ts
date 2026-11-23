import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { FeedTagNotFoundError, getFeedPage } from '@/lib/recommendations/feed.ts'

/**
 * Personalized feed.
 *   GET /api/feed                → FEED_PAGE_SIZE shaped beats
 *   GET /api/feed?cursor=<token> → next page (no repeat beats)
 *   GET /api/feed?tag=<name>     → tag-scoped feed (404 when tag is unknown)
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

  try {
    const page = await getFeedPage(userId, { cursor, tag })
    return NextResponse.json(page)
  } catch (error) {
    if (error instanceof FeedTagNotFoundError) {
      return NextResponse.json({ error: 'Tag not found' }, { status: 404 })
    }
    console.error('Feed error:', error)
    return NextResponse.json({ error: 'Could not load feed' }, { status: 500 })
  }
}


