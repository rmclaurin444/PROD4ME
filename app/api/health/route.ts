import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/health — Railway's healthcheck path. Public, no private data.
 * 200 { ok: true, db: true } once Postgres answers `SELECT 1`; 503 otherwise,
 * so Railway keeps traffic on the previous deploy until this one is healthy.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ ok: true, db: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Healthcheck database error:', error)
    return NextResponse.json(
      { ok: false, db: false },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
