import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const producers = [
  { name: 'Melo K', email: 'melok@prod4me.dev', avatar: 'MK', bio: 'Dark drums and cinematic textures.' },
  { name: 'Nia Saint', email: 'niasaint@prod4me.dev', avatar: 'NS', bio: 'Melodic worlds for late nights.' },
  { name: 'Juno Grey', email: 'junogrey@prod4me.dev', avatar: 'JG', bio: 'Dusty loops and warm samples.' },
  { name: 'Trey Two', email: 'treytwo@prod4me.dev', avatar: 'TT', bio: '808s with a point of view.' },
]

const beats = [
  {
    title: 'NIGHTSHIFT',
    producerEmail: 'melok@prod4me.dev',
    tags: ['dark trap', 'drill'],
    bpm: 142,
    musicalKey: 'F# minor',
    price: 49,
    plays: 84200,
    likes: 12400,
    saves: 1820,
    shares: 320,
    comments: 9,
    artUrl: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=85',
    audioKey: 'seed/nightshift.mp3',
  },
  {
    title: 'VELVET ROOM',
    producerEmail: 'niasaint@prod4me.dev',
    tags: ['melodic', 'r&b'],
    bpm: 88,
    musicalKey: 'A minor',
    price: 120,
    plays: 52800,
    likes: 8900,
    saves: 940,
    shares: 187,
    comments: 4,
    artUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=900&q=85',
    audioKey: 'seed/velvet-room.mp3',
  },
  {
    title: 'LATE CHECKOUT',
    producerEmail: 'junogrey@prod4me.dev',
    tags: ['boom bap', 'lo-fi'],
    bpm: 76,
    musicalKey: 'C major',
    price: 35,
    plays: 31100,
    likes: 5300,
    saves: 610,
    shares: 96,
    comments: 2,
    artUrl: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=900&q=85',
    audioKey: 'seed/late-checkout.mp3',
  },
  {
    title: 'NO SIGNAL',
    producerEmail: 'treytwo@prod4me.dev',
    tags: ['dark trap', '808 heavy'],
    bpm: 148,
    musicalKey: 'D minor',
    price: 75,
    plays: 109000,
    likes: 15200,
    saves: 2310,
    shares: 540,
    comments: 12,
    artUrl: 'https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=900&q=85',
    audioKey: 'seed/no-signal.mp3',
  },
]

async function main() {
  const password = await bcrypt.hash('password123', 10)

  const users = {}
  for (const p of producers) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: {
        email: p.email,
        name: p.name,
        password,
        role: 'PRODUCER',
        avatar: p.avatar,
        bio: p.bio,
      },
    })
    users[p.email] = user
  }

  for (const b of beats) {
    const producer = users[b.producerEmail]
    const { producerEmail, tags, ...rest } = b

    const existing = await prisma.beat.findFirst({
      where: { title: b.title, producerId: producer.id },
    })
    if (existing) continue

    await prisma.beat.create({
      data: {
        ...rest,
        producerId: producer.id,
        tags: {
          connectOrCreate: tags.map(name => ({
            where: { slug: slugify(name) },
            create: { name, slug: slugify(name) },
          })),
        },
      },
    })
  }

  const allTags = await prisma.tag.findMany()
  for (const tag of allTags) {
    const count = await prisma.beat.count({ where: { tags: { some: { id: tag.id } } } })
    await prisma.tag.update({ where: { id: tag.id }, data: { useCount: count } })
  }

  console.log(`Seeded ${producers.length} producers and ${beats.length} beats`)
  console.log(`Tags: ${allTags.map(t => t.name).join(', ')}`)
}

main()
  .catch(e => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
