/**
 * Feed end-to-end library tests. Run:
 *   node --env-file=.env --test scripts/feed.test.ts
 *
 * DONE-WHEN coverage:
 *   1) two users w/ different histories get different feeds
 *   2) a 0-event user gets a populated feed (cold start)
 *   3) pagination returns no duplicates
 *   4) tag filter returns only matching beats (+404 case via FeedTagNotFoundError)
 *
 * Fixtures: zx* emails, zxcheck-* slug tags — self-cleaning.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma.ts'
import { rebuildBeatVector, rebuildUserVector } from '../lib/recommendations/vectors.ts'
import { FeedTagNotFoundError, getFeedPage } from '../lib/recommendations/feed.ts'

const stamp = Date.now().toString(36)

async function cleanupPreviousRun() {
  await prisma.user.deleteMany({ where: { email: { startsWith: 'zx' } } })
  await prisma.tag.deleteMany({ where: { slug: { startsWith: 'zxcheck-' } } })
}

await cleanupPreviousRun()

const producerP = await prisma.user.create({
  data: { email: `zxP-${stamp}@test.dev`, name: 'Feed Prod', password: 'x', role: 'PRODUCER' },
})
const producerQ = await prisma.user.create({
  data: { email: `zxQ-${stamp}@test.dev`, name: 'Feed Prod 2', password: 'x', role: 'PRODUCER' },
})
const trapLover = await prisma.user.create({
  data: { email: `zx1-${stamp}@test.dev`, name: 'Trap Viewer', password: 'x', role: 'ARTIST' },
})
const jazzLover = await prisma.user.create({
  data: { email: `zx2-${stamp}@test.dev`, name: 'Jazz Viewer', password: 'x', role: 'ARTIST' },
})
const freshUser = await prisma.user.create({
  data: { email: `zx3-${stamp}@test.dev`, name: 'Matt Hatter', password: 'x', role: 'ARTIST' },
})

const tagTrap = await prisma.tag.create({
  data: { name: `zxfx-trap-${stamp}`, slug: `zxcheck-trap-${stamp}` },
})
const tagJazz = await prisma.tag.create({
  data: { name: `zxfx-jazz-${stamp}`, slug: `zxcheck-jazz-${stamp}` },
})

async function makeBeat(producerId: string, title: string, tags: Array<{ id: string }>) {
  const beat = await prisma.beat.create({
    data: { title, audioKey: 'zxcheck/none.mp3', price: 19, producerId, tags: { connect: tags.map(t => ({ id: t.id })) } },
  })
  await rebuildBeatVector(beat.id)
  return beat
}

// 6 pure trap + 6 pure jazz mixings across two producers
const trapBeats: Array<Awaited<ReturnType<typeof makeBeat>>> = []
const jazzBeats: Array<Awaited<ReturnType<typeof makeBeat>>> = []
for (let i = 0; i < 6; i++) {
  const owner = i % 2 === 0 ? producerP.id : producerQ.id
  trapBeats.push(await makeBeat(owner, `ZX Trap ${i}`, [tagTrap]))
  jazzBeats.push(await makeBeat(owner, `ZX Jazz ${i}`, [tagJazz]))
}

// give the two viewers DIFFERENT histories (>= COLD_START_MIN_EVENTS = 5)
// each leaves 1 pure beat of their taste unliked for latter candidate space.
for (let i = 0; i < 5; i++) {
  await prisma.engagementEvent.create({
    data: { userId: trapLover.id, beatId: trapBeats[i]!.id, type: 'LIKE' },
  })
  await prisma.engagementEvent.create({
    data: { userId: jazzLover.id, beatId: jazzBeats[i]!.id, type: 'LIKE' },
  })
}
await rebuildUserVector(trapLover.id)
await rebuildUserVector(jazzLover.id)

// 1) different histories → different feeds
test('(1) two users with different histories get different feeds', async () => {
  const [trapPage, jazzPage] = await Promise.all([
    getFeedPage(trapLover.id),
    getFeedPage(jazzLover.id),
  ])

  assert.ok(trapPage.beats.length > 0 && jazzPage.beats.length > 0)
  assert.equal(trapPage.coldStart, false, 'past-threshold trap-lover is personalized')
  assert.equal(jazzPage.coldStart, false)

  const trapTop = trapPage.beats[0]!
  const jazzTop = jazzPage.beats[0]!
  assert.ok(
    trapTop.tags.includes(tagTrap.name),
    `trap-lover's top beat should carry the trap tag (got: ${trapTop.tags.join(',')})`,
  )
  assert.ok(
    jazzTop.tags.includes(tagJazz.name),
    `jazz-lover's top beat should carry the jazz tag (got: ${jazzTop.tags.join(',')})`,
  )
  assert.notEqual(trapTop.id, jazzTop.id, 'the two users lead different feeds')
})

// 2) zero-event user → populated feed via cold start (popularity × recency)
test('(2) a 0-event user gets a populated feed', async () => {
  const page = await getFeedPage(freshUser.id)
  assert.ok(page.beats.length > 0, 'cold-start feed is populated')
  assert.equal(page.coldStart, true, '0 events => cold start branch')
  assert.ok(page.beats.length <= 10, 'cannot exceed FEED_PAGE_SIZE')
  const ids = new Set(page.beats.map(b => b.id))
  assert.equal(ids.size, page.beats.length, 'no duplicates within one page')
})

// 3) pagination: walk every page — no duplicate beats in one session
test('(3) pagination returns no duplicates', async () => {
  const seen = new Set<string>()
  let cursor: string | null = null
  let rounds = 0
  do {
    const page = await getFeedPage(freshUser.id, { cursor })
    for (const beat of page.beats) {
      assert.ok(!seen.has(beat.id), `duplicate beat across pages: ${beat.id}`)
      seen.add(beat.id)
    }
    cursor = page.nextCursor
    rounds += 1
    if (rounds > 20) throw new Error('cursor pagination did not terminate')
  } while (cursor !== null)

  // every eligible fixture beat was delivered exactly once
  const allFixture = [...trapBeats, ...jazzBeats].map(beat => beat.id)
  for (const id of allFixture) {
    assert.ok(seen.has(id), `fixture beat missing from pages: ${id}`)
  }
})

// 4) tag filter returns ONLY matching beats; unknown tag -> not found
test('(4) tag filter returns only matching beats', async () => {
  const page = await getFeedPage(freshUser.id, { tag: tagTrap.name })
  for (const beat of page.beats) {
    assert.ok(
      beat.tags.includes(tagTrap.name),
      `tag feed returned a beat with wrong tags: ${beat.tags.join(',')}`,
    )
  }
  // own/seen/sold exclusions still apply (freshUser owns nothing, so pool
  // equality count sanity: at most all 6 trap beats remain)
  assert.ok(page.beats.length > 0 && page.beats.length <= 6)

  await assert.rejects(
    () => getFeedPage(freshUser.id, { tag: `zxfx-nonexistent-${stamp}` }),
    FeedTagNotFoundError,
    'unknown tag must throw FeedTagNotFoundError (route maps to 404)',
  )
})

after(async () => {
  // users first (cascades beats+events), then tags
  for (const user of [trapLover, jazzLover, freshUser, producerP, producerQ]) {
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {})
  }
  await prisma.tag.deleteMany({ where: { slug: { startsWith: 'zxcheck-' } } })
  await prisma.$disconnect()
})
