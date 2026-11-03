/**
 * End-to-end verification for the recommendation system (after seeding).
 *
 *   node --env-file=.env --test scripts/rec.test.ts
 *
 * The suite seeds its own data (idempotent) and cleans up only the cold-start
 * zx fixtures it creates. The rec-* accounts/beats persist by design so you
 * can log in and browse.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma.ts'
import {
  getCandidates,
  scoreBeat,
  type ScoreContext,
} from '../lib/recommendations/scoring.ts'
import { getFeedPage, FeedTagNotFoundError } from '../lib/recommendations/feed.ts'
import { rebuildUserVector } from '../lib/recommendations/vectors.ts'
import { seedRecommendations } from './seed-recommendations.ts'

const USERS = [
  { email: 'rec-a@prod4me.dev', engaged: ['rec-trap', 'rec-drill'] },
  { email: 'rec-b@prod4me.dev', engaged: ['rec-house', 'rec-techno'] },
  { email: 'rec-c@prod4me.dev', engaged: ['rec-ambient', 'rec-lofi'] },
]

let recUsers: Array<{ id: string; email: string }> = []

before(async () => {
  await seedRecommendations()
  recUsers = await prisma.user.findMany({
    where: { email: { startsWith: 'rec-' } },
    select: { id: true, email: true },
  })
  // alternatively ensure the Taste-touched Beats keep vectors warm:
  for (const user of recUsers) {
    await rebuildUserVector(user.id)
  }
})

after(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: 'zx-rec-cold' } } })
  await prisma.$disconnect()
})

function engagedTagSet(email: string): Set<string> {
  const spec = USERS.find(u => u.email === email)!
  return new Set(spec.engaged)
}

function countEngagedTags(page: { tags: string[] }[], engaged: Set<string>): number {
  return page.filter(beat => beat.tags.some(tag => engaged.has(tag))).length
}

// (1) top-5 personalization
test('each seeded user gets 3+ engaged-tag beats in their top 5', async () => {
  const artists = recUsers.filter(u => /^rec-[abc]@/.test(u.email))
  assert.equal(artists.length, 3, 'seeding produced exactly 3 viewer accounts')
  for (const user of artists) {
    const engaged = engagedTagSet(user.email)
    const feed = await getFeedPage(user.id)
    const top5 = feed.beats.slice(0, 5)
    const hits = countEngagedTags(top5, engaged)
    assert.ok(hits >= 3, `${user.email} expected 3+ engaged-tag beats in top 5 (got ${hits})`)
  }
})

// (2) page composition: 10 beats, 8 ranked + 2 explore
test('feed page composition: 10 beats, last 2 explore-y (zero engaged tags)', async () => {
  const viewer = recUsers.find(u => /^rec-[a]@/.test(u.email))!
  const page = await getFeedPage(viewer.id)
  assert.equal(page.beats.length, 10, 'FEED_PAGE_SIZE = 10')

  const engaged = engagedTagSet(viewer.email)
  const rankedHalf = page.beats.slice(0, 8)
  const tail = page.beats.slice(8)

  // ranked slots aren't guaranteed engaged but our scripted data gives 5+ tagged ones
  assert.ok(countEngagedTags(rankedHalf, engaged) >= 3, 'ranked slots carry taste signal')
  for (const beat of tail) {
    for (const tag of beat.tags) {
      assert.ok(!engaged.has(tag), `explore beat carries an engaged tag: ${beat.id} (${tag})`)
    }
  }
})

// (3) exclusions
test('exclusions hold: no own beats, no seen-in-7d beats, no sold exclusives', async () => {
  for (const user of recUsers.filter(u => /^rec-[abc]-/.test(u.email))) {
    const recentEvents = await prisma.engagementEvent.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { beatId: true },
    })
    const seenBeatIds = new Set(recentEvents.map(e => e.beatId))
    const ownBeatIds = new Set(
      (await prisma.beat.findMany({ where: { producerId: user.id }, select: { id: true } })).map(b => b.id),
    )

    const feed = await getFeedPage(user.id)
    for (const beat of feed.beats) {
      assert.ok(!seenBeatIds.has(beat.id), `${user.email}: seen beat reappeared: ${beat.id}`)
      assert.ok(!ownBeatIds.has(beat.id), `${user.email}: own beat in feed: ${beat.id}`)
      const sold = await prisma.beat.findFirst({ where: { id: beat.id, exclusiveSold: true } })
      assert.equal(sold, null, 'sold exclusive beat appeared in a feed')
    }
  }
})

// (4) follow bonus ordering + hard cap
test('follow bonus applies and never tops 1.0', async () => {
  const now = new Date()
  const followedProd = { id: 'followed-producer' }
  const otherProd = { id: 'other-producer' }

  const context: ScoreContext = {
    producerAffinities: { [followedProd.id]: 1 },
    maxProducerAffinity: 1,
    eventCountsPerBeat: {},
    maxEventCount: 0,
    followedProducerIds: [followedProd.id],
  }

  const maxedContext: ScoreContext = {
    ...context,
    producerAffinities: { [followedProd.id]: 1, [otherProd.id]: 1 },
  }

  const followed = scoreBeat(
    'viewer',
    { id: 'b1', producerId: followedProd.id, createdAt: now },
    1,
    context,
  )
  const notFollowed = scoreBeat(
    'viewer',
    { id: 'b2', producerId: otherProd.id, createdAt: now },
    1,
    maxedContext,
  )
  assert.ok(followed > notFollowed, `follow bonus should promote (` +
    `followed ${followed} vs not-followed ${notFollowed})`)
  // identical component values → identical score plus the FOLLOW_BONUS on
  // top must hit the cap instead of passing it
  const saturated = scoreBeat(
    'viewer',
    { id: 'b1', producerId: followedProd.id, createdAt: now },
    1,
    maxedContext,
  )
  assert.ok(saturated === 1.0, `saturated followed score should cap at 1.0 (got ${saturated})`)
})

// (5) cold start threshold
test('cold start below 5 events, full scoring at 5+', async () => {
  // fresh 0-event user
  const coldUser = await prisma.user.create({
    data: { email: `zx-rec-cold-${Date.now()}@test.dev`, name: 'Zx Cold', password: 'x', role: 'ARTIST' },
  })
  const coldPage = await getFeedPage(coldUser.id)
  assert.equal(coldPage.coldStart, true, '0 events → cold start')
  assert.ok(coldPage.beats.length > 0, 'cold-start feed still populated')

  // push over the threshold and confirm the switch
  const beats = await prisma.beat.findMany({ take: 5, select: { id: true } })
  for (const beat of beats) {
    await prisma.engagementEvent.create({
      data: { userId: coldUser.id, beatId: beat.id, type: 'LIKE' },
    })
  }
  const warmPage = await getFeedPage(coldUser.id)
  assert.equal(warmPage.coldStart, false, '5 events → full scoring')

  // also: seeded viewer accounts (warm) are never cold
  for (const user of recUsers.filter(u => /^rec-[abc]-/.test(u.email))) {
    const page = await getFeedPage(user.id)
    assert.equal(page.coldStart, false, `${user.email} should be warm`)
  }

  await prisma.user.delete({ where: { id: coldUser.id } })
})

// (6) tag mode: only matching tag, and no exploration slots
test('tag feeds are tag-pure, no explore slots', async () => {
  const technoTag = await prisma.tag.findUnique({ where: { name: 'rec-techno' } })
  assert.ok(technoTag, 'seed created rec-techno')

  const tagFeed = await getFeedPage(recUsers[0]!.id, { tag: 'rec-techno' })
  assert.ok(tagFeed.beats.length > 0, 'the tag feed is populated')
  assert.ok(tagFeed.beats.length <= 5, 'only the 5 seeded techno beats exist')
  for (const beat of tagFeed.beats) {
    assert.ok(
      beat.tags.includes('rec-techno'),
      `tag feed returned a non-techno beat: ${beat.tags.join(',')}`,
    )
  }
  // unknown tag → 404 throw (route maps to 404)
  await assert.rejects(
    () => getFeedPage(recUsers[0]!.id, { tag: 'rec-nonexistent' }),
    FeedTagNotFoundError,
    'unknown tag should reject with FeedTagNotFoundError',
  )
})
