import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireVerifiedUser } from '@/lib/auth-guards'
import {
  AUDIO_MIME_TYPES,
  ARTWORK_MIME_TYPES,
  IMAGE_MIME_TYPES,
  MAX_AUDIO_BYTES,
  MAX_ARTWORK_BYTES,
  MAX_IMAGE_BYTES,
  BUCKET_AUDIO,
  BUCKET_ARTWORK,
  buildKey,
  extensionFromMime,
  presignUpload,
} from '@/lib/storage'

/**
 * Presign uploads.
 *  - audio / artwork: Producer-only (beat uploads, original flow)
 *  - avatar / banner: any logged-in role (png, jpg, webp; max 5MB),
 *    stored under `avatars/{userId}/…` and `banners/{userId}/…`
 */
export async function POST(request: Request) {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified
  const session = { user: { id: verified.userId, role: verified.role } }

  let body: { kind?: string; contentType?: string; size?: number }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { kind, contentType, size } = body

  if (kind !== 'audio' && kind !== 'artwork' && kind !== 'avatar' && kind !== 'banner') {
    return NextResponse.json(
      { error: 'kind must be "audio", "artwork", "avatar" or "banner"' },
      { status: 400 }
    )
  }

  if (!contentType) {
    return NextResponse.json({ error: 'contentType is required' }, { status: 400 })
  }

  // producer-only kinds
  if (kind === 'audio' || kind === 'artwork') {
    if (session.user.role !== 'PRODUCER') {
      return NextResponse.json({ error: 'Only producers can upload beats' }, { status: 403 })
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

  // avatar / banner — any role, images only, 5MB
  if (!IMAGE_MIME_TYPES.includes(contentType.toLowerCase())) {
    return NextResponse.json(
      { error: `Unsupported file type for ${kind}: ${contentType} (png, jpg or webp)` },
      { status: 400 }
    )
  }
  if (typeof size === 'number' && size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Image too large — max 5MB' }, { status: 400 })
  }

  const key = buildKey(kind === 'avatar' ? 'avatars' : 'banners', session.user.id, extensionFromMime(contentType))
  try {
    const uploadUrl = await presignUpload(BUCKET_ARTWORK, key)
    return NextResponse.json({ uploadUrl, key, bucket: BUCKET_ARTWORK })
  } catch (error) {
    console.error('Presign error:', error)
    return NextResponse.json({ error: 'Could not create upload URL' }, { status: 500 })
  }
}
