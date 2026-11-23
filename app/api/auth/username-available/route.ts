import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeUsername, usernameError } from '@/lib/username'

/** GET /api/auth/username-available?u= — live signup availability check. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const raw = url.searchParams.get('u') ?? ''
  const normalized = normalizeUsername(raw)

  const error = usernameError(normalized)
  if (error) return NextResponse.json({ available: false, error })

  const taken = await prisma.user.findUnique({ where: { username: normalized } })
  return NextResponse.json({ available: !taken })
}
