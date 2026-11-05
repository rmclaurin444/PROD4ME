import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getBeats } from '@/lib/beats'
import { getArtistLibrary } from '@/lib/licenses'
import { devPanelEnabled } from '@/lib/dev-seed'
import { AppShell } from '@/components/app/app-shell'

export default async function Page() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/login')
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      interests: { select: { id: true, name: true } },
    },
  })

  if (!user) {
    redirect('/login')
  }

  // Real producer directory for search results + producer pages (an empty
  // `users` mock array with fabricated follower counts lives no longer).
  const producers = await prisma.user.findMany({
    where: { role: 'PRODUCER' },
    select: { id: true, name: true, avatar: true, bio: true },
    orderBy: { name: 'asc' },
  })

  // Only artists see the genre step, so only their Interests rank the feed.
  const interestNames = user.role === 'ARTIST' ? user.interests.map(tag => tag.name) : []
  const beats = await getBeats(50, interestNames)
  const library = user.role === 'ARTIST' ? await getArtistLibrary(user.id) : []

  const ownedOffers =
    user.role === 'PRODUCER'
      ? await prisma.offer.count({
          where: { producerId: user.id, status: { in: ['PENDING', 'COUNTERED', 'AWAITING_PAYMENT'] } },
        })
      : 0

  return (
    <AppShell
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        bio: user.bio,
        banner: user.banner,
        theme: user.theme,
      }}
      beats={beats}
      library={library}
      openOffers={ownedOffers}
      producers={producers}
      devPanel={devPanelEnabled()}
    />
  )
}
