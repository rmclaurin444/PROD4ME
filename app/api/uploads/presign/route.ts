import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  AUDIO_MIME_TYPES,
  ARTWORK_MIME_TYPES,
  MAX_AUDIO_BYTES,
  MAX_ARTWORK_BYTES,
  BUCKET_AUDIO,
  BUCKET_ARTWORK,
  buildKey,
  extensionFromMime,
  presignUpload,
} from '@/lib/storage'

export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (session.user.role !== 'PRODUCER') {
    return NextResponse.json({ error: 'Only producers can upload beats' }, { status: 403 })
  }

  let body: { kind?: string; contentType?: string; size?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { kind, contentType, size } = body

  if (kind !== 'audio' && kind !== 'artwork') {
    return NextResponse.json({ error: 'kind must be "audio" or "artwork"' }, { status: 400 })
  }

  if (!contentType) {
    return NextResponse.json({ error: 'contentType is required' }, { status: 400 })
  }

  const allowed = kind === 'audio' ? AUDIO_MIME_TYPES : ARTWORK_MIME_TYPES
  if (!allowed.includes(contentType.toLowerCase())) {
    return NextResponse.json(
      { error: `Unsupported file type for ${kind}: ${contentType}` },
      { status: 400 }
    )
  }

  const maxBytes = kind === 'audio' ? MAX_AUDIO_BYTES : MAX_ARTWORK_BYTES
  if (typeof size === 'number' && size > maxBytes) {
    return NextResponse.json(
      { error: `File too large. Max ${kind} size is ${Math.floor(maxBytes / (1024 * 1024))}MB` },
      { status: 400 }
    )
  }

  const bucket = kind === 'audio' ? BUCKET_AUDIO : BUCKET_ARTWORK
  const key = buildKey(kind, session.user.id, extensionFromMime(contentType))

  try {
    const uploadUrl = await presignUpload(bucket, key)
    return NextResponse.json({ uploadUrl, key, bucket })
  } catch (error) {
    console.error('Presign error:', error)
    return NextResponse.json({ error: 'Could not create upload URL' }, { status: 500 })
  }
}
