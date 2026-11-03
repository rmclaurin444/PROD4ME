/**
 * Recommendation-system seed data.
 *
 *   node --env-file=.env scripts/seed-recommendations.ts
 *   node --env-file=.env scripts/seed-recommendations.ts --clean   (purge only)
 *
 * Creates 3 artist users (A: trap/drill, B: house/techno, C: ambient/lofi),
 * 2 producers, 30 beats across 6 tags (5 beats per tag; each beat carries 1-2
 * tags — the last two per group pair with the NEXT group), and a scripted
 * engagement history per user (likes/saves/plays + 1 skip + 1 producer
 * follow each). Beat and user vectors are rebuilt via lib/recommendations.
 *
 * The events deliberately leave 4 unseen beats per user carrying their
 * engaged tags — the signature stays testable (top-5 assertions).
 */
import { prisma } from '../lib/prisma.ts'
import bcrypt from 'bcryptjs'
import { rebuildBeatVector, rebuildUserVector } from '../lib/recommendations/vectors.ts'

const USER_PASSWORD = bcrypt.hashSync('password123', 10)

const TAG_NAMES = ['rec-trap', 'rec-drill', 'rec-house', 'rec-techno', 'rec-ambient', 'rec-lofi']

const PRODUCERS = [
  { email: 'rec-producer-1@prod4me.dev', name: 'Rec Producer One', bio: 'Recommendation fixture producer.' },
  { email: 'rec-producer-2@prod4me.dev', name: 'Rec Producer Two', bio: 'Recommendation fixture producer.' },
]

const USERS = [
  { email: 'rec-a@prod4me.dev', name: 'Rec Artist A', engagedTags: [TAG_NAMES[0]!, TAG_NAMES[1]!] },
  { email: 'rec-b@prod4me.dev', name: 'Rec Artist B', engagedTags: [TAG_NAMES[2]!, TAG_NAMES[3]!] },
  { email: 'rec-c@prod4me.dev', name: 'Rec Artist C', engagedTags: [TAG_NAMES[4]!, TAG_NAMES[5]!] },
]

type Spec = {
  type: 'LIKE' | 'SAVE' | 'PLAY_50' | 'SKIP' | 'FOLLOW_PRODUCER'
  g: number
  k: number
}[]

/** Scripted engagement per user. Indexes are (group, slot); the FOLLOW event
 *  always lands on the user's second engaged-group pure beat by producer 2. */
function engagementSpecFor(userIndex: number, groupOffset: number): Spec {
  const g0 = groupOffset
  const g1 = (groupOffset + 1) % 6
  const g2 = (groupOffset + 2) % 6
  const g3 = (groupOffset + 3) % 6
  const g4 = (groupOffset + 4) % 6
  return [
    { type: 'LIKE', g: g0, k: 1 },
    { type: 'LIKE', g: g0, k: 2 },
    { type: 'LIKE', g: g1, k: 0 },
    { type: 'LIKE', g: g1, k: 1 },
    { type: 'LIKE', g: g1, k: 2 },
    { type: 'SAVE', g: g2, k: 0 },
    { type: 'PLAY_50', g: g3, k: 0 },
    { type: 'SKIP', g: g4, k: 1 },
  ]
}

export async function seedRecommendations(): Promise<void> {
  await cleanup()

  // producers
  const producerIds: string[] = []
  for (const producer of PRODUCERS) {
    const user = await prisma.user.upsert({
      where: { email: producer.email },
      update: {},
      create: {
        email: producer.email,
        name: producer.name,
        password: USER_PASSWORD,
        role: 'PRODUCER',
        bio: producer.bio,
      },
    })
    producerIds.push(user.id)
  }

  // tags
  const tagRows = []
  for (const name of TAG_NAMES) {
    tagRows.push(await prisma.tag.create({ data: { name, slug: `rec-${name}` } }))
  }

  // 30 beats: group g gets 5 beats; last two carry the group + next group
  const beatIds: string[] = []
  const beatsByPosition = new Map<string, string>() // `G{g}K{k}` -> beat id
  for (let g = 0; g < 6; g++) {
    for (let k = 0; k < 5; k++) {
      const tagIds = k < 3 ? [tagRows[g]!] : [tagRows[g]!, tagRows[(g + 1) % 6]!]
      const soldExclusive = g === 3 && k === 1 // one sold techno beat (exclusion test)
      const beat = await prisma.beat.create({
        data: {
          title: `Rec Beat G${g}K${k}`,
          audioKey: 'rec/fixture.mp3',
          price: 19,
          bpm: 80 + g * 8,
          musicalKey: ['A minor', 'C minor', 'E minor', 'F# minor', 'G minor', 'B minor'][g]!,
          producerId: producerIds[k % producerIds.length]!,
          tags: { connect: tagIds.map(tag => ({ id: tag.id })) },
          exclusiveSold: soldExclusive,
          exclusivePriceCents: soldExclusive ? 49900 : null,
        },
      })
      beatIds.push(beat.id)
      beatsByPosition.set(`G${g}K${k}`, beat.id)
    }
  }

  for (const beatId of beatIds) {
    await rebuildBeatVector(beatId)
  }

  // scripted engagement for the three viewers
  for (let u = 0; u < USERS.length; u++) {
    const spec = USERS[u]!
    const artist = await prisma.user.create({
      data: {
        email: spec.email,
        name: spec.name,
        password: USER_PASSWORD,
        role: 'ARTIST',
        bio: 'Recommendation fixture artist.',
      },
    })

    for (const event of engagementSpecFor(u, u * 2)) {
      const beatId = beatsByPosition.get(`G${event.g}K${event.k}`)
      if (!beatId) throw new Error(`missing beat for G${event.g}K${event.k}`)
      await prisma.engagementEvent.create({
        data: { userId: artist.id, beatId, type: event.type },
      })
    }

    // the one follow: producer 2, on the user's second engaged-group beat
    const followBeatId = beatsByPosition.get(`G${(u * 2 + 1) % 6}K2`)!
    await prisma.engagementEvent.create({
      data: { userId: artist.id, beatId: followBeatId, type: 'FOLLOW_PRODUCER' },
    })

    await rebuildUserVector(artist.id)
  }
}

async function cleanup() {
  // ONLY rec fixtures — do not touch the real seeded producers/@test accounts
  await prisma.user.deleteMany({ where: { email: { startsWith: 'rec-' } } })
  await prisma.tag.deleteMany({ where: { slug: { startsWith: 'rec-' } } })
}

const isDirectRun = process.argv[1]?.includes('seed-recommendations')
if (isDirectRun) {
  const cleanOnly = process.argv.includes('--clean')

  const run = cleanOnly
    ? cleanup().then(() => {
        console.log('Recommendation fixtures purged (rec-* users, beats, rec-* tags).')
      })
    : seedRecommendations().then(() => {
        console.log('Recommendation seed complete: 3 viewers, 2 producers, 30 beats, 6 tags.')
        console.log('Logins: rec-a@prod4me.dev, rec-b@prod4me.dev, rec-c@prod4me.dev (password: password123)')
      })

  run
    .catch(e => {
      console.error('Seed failed:', e)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
