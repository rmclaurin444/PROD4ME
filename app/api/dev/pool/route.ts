import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { clearAudioPool, devPanelEnabled, listAudioPool } from '@/lib/dev-seed'

/** Dev panel routes exist only outside production (or with DEV_PANEL=1). */
function guard(): NextResponse | null {
  if (!devPanelEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return null
}

/** Dev audio pool contents (files the seeder draws from). */
export async function GET() {
  const blocked = guard()
  if (blocked) return blocked

  const entries = await listAudioPool()
  return NextResponse.json({
    files: entries.length,
    bytes: entries.reduce((sum, entry) => sum + entry.size, 0),
  })
}

/** Empty the pool (uploaded pool files only — beats are untouched). */
export async function DELETE() {
  const blocked = guard()
  if (blocked) return blocked

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const cleared = await clearAudioPool()
    return NextResponse.json({ cleared })
  } catch (error) {
    console.error('Dev pool clear error:', error)
    return NextResponse.json({ error: 'Clear failed' }, { status: 500 })
  }
}
