import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { isAdmin } from '@/lib/admin'
import { clearAudioPool, devPanelEnabled, listAudioPool } from '@/lib/dev-seed'

/**
 * Shared guard for dev routes:
 *  - 404 when the dev tools are disabled (production without DEV_PANEL=1)
 *  - 401 when logged out
 *  - 403 for logged-in non-admins
 */
async function adminGuard(): Promise<NextResponse | null> {
  if (!devPanelEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isAdmin(session.user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

/** Dev audio pool contents (files the seeder draws from). */
export async function GET() {
  const blocked = await adminGuard()
  if (blocked) return blocked

  const entries = await listAudioPool()
  return NextResponse.json({
    files: entries.length,
    bytes: entries.reduce((sum, entry) => sum + entry.size, 0),
  })
}

/** Empty the pool (uploaded pool files only — beats are untouched). */
export async function DELETE() {
  const blocked = await adminGuard()
  if (blocked) return blocked

  try {
    const cleared = await clearAudioPool()
    return NextResponse.json({ cleared })
  } catch (error) {
    console.error('Dev pool clear error:', error)
    return NextResponse.json({ error: 'Clear failed' }, { status: 500 })
  }
}

