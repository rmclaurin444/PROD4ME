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

// Beat seeding was removed: placeholder beats (with fictional audio keys that
// never existed in MinIO) no longer belong in a real marketplace. Beats enter
// the system through the Upload flow only.

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

  // Test artist account (password123) with genre interests, so the
  // interest-ranked feed path is testable immediately after seeding.
  const artistEmail = 'artist@test.com'
  const existingArtist = await prisma.user.findUnique({ where: { email: artistEmail } })
  if (!existingArtist) {
    await prisma.user.create({
      data: {
        email: artistEmail,
        name: 'Test Artist',
        password,
        role: 'ARTIST',
        bio: 'Artist on PROD4ME.',
        interests: {
          connectOrCreate: ['drill', 'dark trap'].map(name => ({
            where: { slug: slugify(name) },
            create: { name, slug: slugify(name), type: 'GENRE' },
          })),
        },
      },
    })
    await prisma.tag.updateMany({
      where: { slug: { in: ['drill', 'dark-trap'] } },
      data: { interestCount: { increment: 1 } },
    })
  }

  const allTags = await prisma.tag.findMany()
  for (const tag of allTags) {
    const count = await prisma.beat.count({ where: { tags: { some: { id: tag.id } } } })
    await prisma.tag.update({ where: { id: tag.id }, data: { useCount: count } })
  }

  console.log(`Seeded ${producers.length} test producer accounts (no seeded beats)`)
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
