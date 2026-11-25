import { NextResponse } from 'next/server'
import { BUCKET_ARTWORK, isMediaKey, presignDownload } from '@/lib/storage'

export const dynamic = 'force-dynamic'

const PRESIGN_SECONDS = 3600
// shorter than the presign lifetime so a cached redirect never points at an
// expired URL
const CACHE_SECONDS = 3000

/**
 * GET /api/media/<key> — public images (artwork, avatars, banners, playlist
 * covers) from the private artwork bucket. Responds with a 302 redirect to a
 * presigned GET URL, so the browser downloads straight from the bucket and no
 * file data passes through the app. Audio is never served here (it stays
 * behind the existing authenticated presigned URLs).
 *
 * No login required — these images are public inside the app.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key: segments } = await ctx.params
  let key = ''
  try {
    key = (segments ?? []).map(segment => decodeURIComponent(segment)).join('/')
  } catch {
    key = ''
  }

  if (!key || !isMediaKey(key)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const url = await presignDownload(BUCKET_ARTWORK, key, PRESIGN_SECONDS)
    return new NextResponse(null, {
      status: 302,
      headers: {
        Location: url,
        'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      },
    })
  } catch (error) {
    console.error('Media presign error:', error)
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
}
