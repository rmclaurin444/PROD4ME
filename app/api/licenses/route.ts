import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getArtistLibrary } from '@/lib/licenses'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ARTIST') {
    return NextResponse.json({ licenses: [] })
  }
  const licenses = await getArtistLibrary(session.user.id)
  return NextResponse.json({ licenses })
}
