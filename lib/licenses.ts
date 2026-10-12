import { prisma } from '@/lib/prisma'
import { BUCKET_ARTWORK, publicUrl } from '@/lib/storage'
import type { ShapedLicense } from '@/lib/offers'

export async function getArtistLibrary(artistId: string): Promise<ShapedLicense[]> {
  const licenses = await prisma.license.findMany({
    where: { artistId },
    orderBy: { createdAt: 'desc' },
    include: { beat: { include: { producer: { select: { name: true } } } } },
  })

  return licenses.map(license => ({
    id: license.id,
    licenseType: license.licenseType,
    pricePaidCents: license.pricePaidCents,
    createdAt: license.createdAt.toISOString(),
    beat: {
      id: license.beat.id,
      title: license.beat.title,
      price: license.beat.price,
      exclusivePriceCents: license.beat.exclusivePriceCents,
      exclusiveSold: license.beat.exclusiveSold,
      producer: license.beat.producer.name,
      artUrl: license.beat.artKey ? publicUrl(BUCKET_ARTWORK, license.beat.artKey) : license.beat.artUrl,
      artPreset: license.beat.artPreset,
    },
  }))
}
