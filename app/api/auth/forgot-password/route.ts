import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { issueResetToken } from '@/lib/reset-token'
import { EMAIL_TEMPLATES, sendEmail } from '@/lib/email'

const WINDOW_MS = 15 * 60 * 1000
const MAX_REQUESTS = 5
const hits = new Map<string, number[]>()

function rateLimited(ip: string) {
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter(t => now - t < WINDOW_MS)
  if (recent.length >= MAX_REQUESTS) return true
  recent.push(now)
  hits.set(ip, recent)
  return false
}

const GENERIC_MESSAGE =
  'If an account with that email exists, a reset link has been created. Follow the link to choose a new password.'

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  if (rateLimited(ip)) {
    return NextResponse.json({ error: 'Too many attempts — try again in a few minutes.' }, { status: 429 })
  }

  let body: { email?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })

  let devLink: string | undefined
  if (user) {
    const token = await issueResetToken(email)
    const origin = request.headers.get('origin') ?? 'http://localhost:3000'
    const link = `${origin}/reset?token=${token}`
    // Email the reset link through lib/email; in dev without RESEND_API_KEY
    // the link is logged and returned to the UI (never in production).
    try {
      await sendEmail({
        to: email,
        subject: 'Reset your PROD4ME password',
        heading: 'Password reset',
        lines: ['Open the link below to choose a new password. The link expires in one hour.'],
        ctaLabel: 'Reset password',
        link,
      })
    } catch (error) {
      console.error('Reset email error:', error)
    }
    if (process.env.NODE_ENV !== 'production') {
      devLink = link
    }
  }

  return NextResponse.json({ message: GENERIC_MESSAGE, devLink })
}
