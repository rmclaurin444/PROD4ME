import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getBeats, type ShapedBeat } from '@/lib/beats'
import { getArtistLibrary } from '@/lib/licenses'
import { WAITING_OFFER_STATUSES } from '@/lib/offers'
import { STUDIO_ENABLED } from '@/lib/studio/flags'
import { ComingSoon } from '@/components/studio/coming-soon'
import { StudioApp } from '@/components/studio/studio-app'

export const dynamic = 'force-dynamic'

/**
 * Studio route. Gated by the STUDIO_ENABLED flag (lib/studio/flags.ts):
 *  - flag off → every role sees the Coming Soon screen and no data loads.
 *  - flag on  → both ARTIST and PRODUCER may open the workspace (producers
 *               for engineering; the artist trial/licensing flow is
 *               unchanged).
 * Logged-out users always go to /login.
 */
export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/login')
  }

  // Flag off: skip all data loading and render the Coming Soon screen.
  if (!STUDIO_ENABLED) {
    return <ComingSoon />
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, role: true },
  })

  if (!user) {
    redirect('/login')
  }

  // TODO(producer-engineering): producers currently get the artist workspace
  // as-is, including the trial/licensing gates on beats they don't own. When
  // the collaborator's Studio integration lands, give producers a gateless
  // view of their own beats (their uploads should read as licensed for them).

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
