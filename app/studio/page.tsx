import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getBeats, type ShapedBeat } from '@/lib/beats'
import { getArtistLibrary } from '@/lib/licenses'
import { WAITING_OFFER_STATUSES } from '@/lib/offers'
import { StudioApp } from '@/components/studio/studio-app'

export const dynamic = 'force-dynamic'

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/login')
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, role: true },
  })

  if (!user) {
    redirect('/login')
  }

  // Studio is an Artist-only workspace — Producers bounce back to the app.
  if (user.role !== 'ARTIST') {
    redirect('/')
  }

  const params = await searchParams
  const entryBeatId = typeof params.beat === 'string' ? params.beat : null

  // Catalog data for the "Open/Try in Studio" entry points and the My Beats
  // panel. Read-only reuse of the existing loaders; failure keeps Studio
  // usable on pure mock data.
  let beats: ShapedBeat[] = []
  let licensedBeatIds: string[] = []
  let pendingOfferBeatIds: string[] = []
  try {
    const [shaped, library, waitingOffers] = await Promise.all([
      getBeats(24),
      getArtistLibrary(user.id),
      prisma.offer.findMany({
        where: { artistId: user.id, status: { in: [...WAITING_OFFER_STATUSES] } },
        select: { beatId: true },
      }),
    ])
    beats = shaped
    licensedBeatIds = library.map(l => l.beat.id)
    pendingOfferBeatIds = waitingOffers.map(o => o.beatId)
  } catch {
    // fall back to demo-only catalog
  }

  return (
    <StudioApp
      user={{ id: user.id, name: user.name }}
      beats={beats}
      licensedBeatIds={licensedBeatIds}
      pendingOfferBeatIds={pendingOfferBeatIds}
      entryBeatId={entryBeatId}
    />
  )
}
