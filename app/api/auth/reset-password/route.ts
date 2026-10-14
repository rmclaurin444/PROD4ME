import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { clearResetToken, consumeResetToken } from '@/lib/reset-token'

export async function POST(request: Request) {
  let body: { token?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!token) {
    return NextResponse.json({ error: 'Reset link is missing its token' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const userId = await consumeResetToken(token)
  if (!userId) {
    return NextResponse.json(
      { error: 'This reset link is invalid or has expired. Request a new one.' },
      { status: 400 }
    )
  }

  const hashedPassword = await bcrypt.hash(password, 10)
  await prisma.user.update({ where: { id: userId }, data: { password: hashedPassword } })
  await clearResetToken(userId)

  return NextResponse.json({ ok: true })
}
