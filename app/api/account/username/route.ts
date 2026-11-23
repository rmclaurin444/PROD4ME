import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { normalizeUsername, usernameError } from '@/lib/username'

/** PATCH /api/account/username — { username } */
export async function PATCH(request: Request) {
  const authed = await requireVerifiedUser()
  if (authed instanceof NextResponse) return authed

  const user = await prisma.user.findUnique({
    where: { id: authed.userId },
    select: { id: true, username: true },
  })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { username?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const username = typeof body.username === 'string' ? body.username : ''
  const normalized = normalizeUsername(username)
  const error = usernameError(normalized)
  if (error) return NextResponse.json({ error }, { status: 400 })
  if (normalized === user.username) return NextResponse.json({ ok: true })

  const taken = await prisma.user.findUnique({ where: { username: normalized } })
  if (taken) return NextResponse.json({ error: 'That username is taken' }, { status: 400 })

  await prisma.user.update({ where: { id: user.id }, data: { username: normalized } })
  return NextResponse.json({ ok: true })
}
