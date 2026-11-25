import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAdmin } from '@/lib/admin'
import { getBeats } from '@/lib/beats'
import { getProducerPlaylists } from '@/lib/playlists'
import { getArtistLibrary } from '@/lib/licenses'
import { publicUrl, BUCKET_ARTWORK } from '@/lib/storage'
import { expireStaleOffers } from '@/lib/offers'
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

  // Real producer directory for the leaderboard/feed profile shortcuts (the
  // old mock `users` array with fabricated follower counts is gone — header
  // search hits GET /api/users/search).
  const producers = await prisma.user.findMany({
    where: { role: 'PRODUCER' },
    select: { id: true, name: true, username: true, avatar: true, bio: true },
    orderBy: { name: 'asc' },
  })

  // Only artists see the genre step, so only their Interests rank the feed.
  const interestNames = user.role === 'ARTIST' ? user.interests.map(tag => tag.name) : []
  const beats = await getBeats(50, interestNames)
  const library = user.role === 'ARTIST' ? await getArtistLibrary(user.id) : []

  // image URLs for the user's own avatar/banner (through publicUrl, so the
  // /api/media redirect is used when MEDIA_PROXY=1)
  const avatarUrl = user.avatar ? publicUrl(BUCKET_ARTWORK, user.avatar) : null
  const bannerUrl = user.banner ? publicUrl(BUCKET_ARTWORK, user.banner) : null
  // lazy expiry so the open-offers badge never counts overdue offers
  if (user.role === 'PRODUCER') await expireStaleOffers()
  const ownedOffers =
    user.role === 'PRODUCER'
      ? await prisma.offer.count({
          where: { producerId: user.id, status: { in: ['PENDING', 'COUNTERED', 'AWAITING_PAYMENT'] } },
        })
      : 0

  const playlists = user.role === 'PRODUCER' ? await getProducerPlaylists(user.id) : []

  // Prompt 13: own profile follow counts (producer profile header)
  const [followerCount, followingCount] = await Promise.all([
    prisma.follow.count({ where: { followingId: user.id } }),
    prisma.follow.count({ where: { followerId: user.id } }),
  ])

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
        followerCount,
        followingCount,
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
