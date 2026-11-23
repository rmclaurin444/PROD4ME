import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireVerifiedUser } from '@/lib/auth-guards'

/**
 * PATCH /api/profile — saves bio, theme (id or custom JSON string), avatar
 * (object key) and banner (object key). Reads the user from the session.
 */
export async function PATCH(request: Request) {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified

  let body: { bio?: unknown; theme?: unknown; avatar?: unknown; banner?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const data: { bio?: string; theme?: string; avatar?: string; banner?: string } = {}

  if (body.bio !== undefined) {
    const bio = typeof body.bio === 'string' ? body.bio.trim() : ''
    if (bio.length > 500) {
      return NextResponse.json({ error: 'Bio is too long (max 500 characters)' }, { status: 400 })
    }
    data.bio = bio
  }

  if (body.theme !== undefined) {
    if (typeof body.theme !== 'string' || body.theme.length === 0 || body.theme.length > 200) {
      return NextResponse.json({ error: 'Invalid theme' }, { status: 400 })
    }
    data.theme = body.theme
  }

  if (body.avatar !== undefined) {
    if (body.avatar !== null && (typeof body.avatar !== 'string' || body.avatar.length === 0 || body.avatar.length > 200)) {
      return NextResponse.json({ error: 'Invalid avatar key' }, { status: 400 })
    }
    data.avatar = body.avatar as string | undefined
  }

  if (body.banner !== undefined) {
    if (body.banner !== null && (typeof body.banner !== 'string' || body.banner.length === 0 || body.banner.length > 200)) {
      return NextResponse.json({ error: 'Invalid banner key' }, { status: 400 })
    }
    data.banner = body.banner as string | undefined
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const user = await prisma.user.update({
    where: { id: verified.userId },
    data,
    select: { id: true, bio: true, theme: true, avatar: true, banner: true },
  })

  return NextResponse.json({ user })
}
