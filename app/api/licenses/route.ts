import { NextResponse } from 'next/server'
import { requireVerifiedUser } from '@/lib/auth-guards'
import { getArtistLibrary } from '@/lib/licenses'

export async function GET() {
  const verified = await requireVerifiedUser()
  if (verified instanceof NextResponse) return verified
  const session = { user: { id: verified.userId, role: verified.role } }
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ARTIST') {
    return NextResponse.json({ licenses: [] })
  }
  const licenses = await getArtistLibrary(session.user.id)
  return NextResponse.json({ licenses })
}

