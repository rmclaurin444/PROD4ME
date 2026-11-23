import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/admin'
import { getBeats } from '@/lib/beats'
import { getProducerPlaylists } from '@/lib/playlists'
import { getArtistLibrary } from '@/lib/licenses'
import { presignDownload, BUCKET_ARTWORK } from '@/lib/storage'
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

  // presigned image URLs for the user's own avatar/banner
  const avatarUrl = user.avatar ? await presignDownload(BUCKET_ARTWORK, user.avatar) : null
  const bannerUrl = user.banner ? await presignDownload(BUCKET_ARTWORK, user.banner) : null
  const ownedOffers =
    user.role === 'PRODUCER'
      ? await prisma.offer.count({
          where: { producerId: user.id, status: { in: ['PENDING', 'COUNTERED', 'AWAITING_PAYMENT'] } },
        })
      : 0

  const playlists = user.role === 'PRODUCER' ? await getProducerPlaylists(user.id) : []

  return (
    <AppShell
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        bio: user.bio,
        banner: bannerUrl ?? user.banner,
        theme: user.theme,
        avatar: avatarUrl ?? user.avatar,
      }}
      beats={beats}
      library={library}
      openOffers={ownedOffers}
      producers={producers}
      playlists={playlists}
      isAdmin={isAdmin(user.email)}
    />
  )
}
