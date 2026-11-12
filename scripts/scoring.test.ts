/**
 * Node built-in test runner. Run:
 *   node --env-file=.env --test scripts/scoring.test.ts
 *
 * Uses disposable fixtures (zxcheck-* tags, temp users, temp beats) and
 * cleans up after itself. Tests are sequential; shared fixture state is
 * reset explicitly per stage.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/prisma.ts'
import { rebuildBeatVector, rebuildUserVector } from '../lib/recommendations/vectors.ts'
import {
  getCandidates,
  rankCandidates,
  scoreBeat,
  daysSince,
} from '../lib/recommendations/scoring.ts'
import type { ScoreContext } from '../lib/recommendations/scoring.ts'

const stamp = Date.now().toString(36)

// ---- fixture scaffolding ------------------------------------------------
async function cleanupPreviousRun() {
  // crashed earlier runs leave fixtures behind (cleanup lives in `after`)
  await prisma.user.deleteMany({ where: { email: { startsWith: 'zx' } } })
  await prisma.tag.deleteMany({ where: { slug: { startsWith: 'zxcheck-' } } })
}

await cleanupPreviousRun()

const producerA = await prisma.user.create({
  data: { email: `zxA-${stamp}@test.dev`, name: 'Trap Maker A', password: 'x', role: 'PRODUCER' },
})
const producerB = await prisma.user.create({
  data: { email: `zxB-${stamp}@test.dev`, name: 'Jazz Maker B', password: 'x', role: 'PRODUCER' },
})
const user = await prisma.user.create({
  data: { email: `zxU-${stamp}@test.dev`, name: 'Viewer U', password: 'x', role: 'ARTIST' },
})

async function makeTag(name: string) {
  // stamped everywhere: a real tag named e.g. "trap" may legitimately exist
  return prisma.tag.create({
    data: {
      name: `zxfx-${name}-${stamp}`,
      slug: `zxcheck-${name}-${stamp}`,
    },
  })
}

async function makeBeat(
  producerId: string,
  title: string,
  tags: Array<{ id: string }>,
  opts: { exclusiveSold?: boolean } = {},
) {
  const beat = await prisma.beat.create({
    data: {
      title,
      audioKey: 'zxcheck/none.mp3',
      price: 49,
      producerId,
      tags: { connect: tags.map(tag => ({ id: tag.id })) },
      exclusiveSold: opts.exclusiveSold ?? false,
    },
  })
  await rebuildBeatVector(beat.id)
  return beat
}

// shared tag rows (vector slots) so taste and beat vectors interlock
const tagTrap = await makeTag('trap')
const trapIndex = tagTrap.vectorIndex!

const tagJazz = await makeTag('jazz')
const tagDrill = await makeTag('drill')

const beatTrapB3 = await makeBeat(producerB.id, 'ZX Trap Wire', [tagTrap])
const beatTrapB1 = await makeBeat(producerA.id, 'ZX Trap+Drill', [tagTrap, tagDrill])
const beatJazzB2 = await makeBeat(producerA.id, 'ZX Brass Line', [tagJazz])
const beatExclusiveB4 = await makeBeat(producerB.id, 'ZX Sold Excl', [tagTrap], {
  exclusiveSold: true,
})

// unit vector pointing exactly at the trap slot
async function setTasteAtTrap(unit = true) {
  const v = new Array(256).fill(0)
  if (unit) v[trapIndex] = 1
  const literal = `[${v.join(',')}]`
  await prisma.$executeRaw`UPDATE "User" SET "tasteVector" = ${literal}::vector WHERE id = ${user.id}`
}

async function resetUserEvents() {
  await prisma.engagementEvent.deleteMany({ where: { userId: user.id } })
  await rebuildUserVector(user.id)
}

function expectNoCandidates() {}

// (a) trap-only user -> trap-tagged beats rank first
test('(a) trap-only user gets trap beats ranked first', async () => {
  await resetUserEvents()
  await setTasteAtTrap()

  const ranked = await rankCandidates(user.id)
  assert.ok(ranked.length >= 2, 'expected ranked candidates')

  const top = ranked[0]!
  assert.equal(top.beat.id, beatTrapB3.id, 'pure trap beat is first')
  assert.ok(top.similarity > 0.999, `cosine ~1 for identical tag sets (got ${top.similarity})`)

  const jazzBeat = ranked.find(r => r.beat.id === beatJazzB2.id)!
  assert.ok(jazzBeat, 'jazz beat still present in candidates')
  assert.ok(jazzBeat.similarity <= 0.01, 'zero-overlap similarity ~0 (never filtered)')
  assert.ok(jazzBeat.score < top.score, 'jazz beat scored below the trap beat')

  // trap+drill beat: similarity 1/sqrt(2), still ranked
  const trapDrill = ranked.find(r => r.beat.id === beatTrapB1.id)!
  assert.ok(trapDrill.similarity > 0.7 && trapDrill.similarity < 0.71)
})

// (b) a SKIP event lowers the taste vector's cosine to that beat's tags
test('(b) a skip lowers a beat similarity', async () => {
  await resetUserEvents()
  await setTasteAtTrap()

  const similarityOf = async (beatId: string): Promise<number | null> => {
    const rows = await prisma.$queryRaw<Array<{ sim: number | null }>>`
      SELECT 1 - (b."tagVector" <=> u."tasteVector") AS sim
      FROM "Beat" b, "User" u
      WHERE b.id = ${beatId} AND u.id = ${user.id} AND u."tasteVector" IS NOT NULL`
    return rows[0]?.sim === null || rows[0] === undefined ? null : Number(rows[0].sim)
  }

  const beforeTrapWire = await similarityOf(beatTrapB3.id)
  const beforeJazz = await similarityOf(beatJazzB2.id)
  const beforeTrapDrill = await similarityOf(beatTrapB1.id)

  // positive signal on the other-tag beat + SKIP the pure-trap beat
  await prisma.engagementEvent.create({
    data: { userId: user.id, beatId: beatTrapB1.id, type: 'LIKE' },
  })
  await prisma.engagementEvent.create({
    data: { userId: user.id, beatId: beatTrapB3.id, type: 'SKIP' },
  })
  await rebuildUserVector(user.id)

  const afterTrapWire = await similarityOf(beatTrapB3.id)
  const afterJazz = await similarityOf(beatJazzB2.id)
  const afterTrapDrill = await similarityOf(beatTrapB1.id)

  assert.ok(afterTrapWire !== null && afterTrapWire < (beforeTrapWire ?? 1),
    `skip lowered similarity to the skipped beat's tags (${beforeTrapWire} -> ${afterTrapWire})`)
  assert.ok(afterTrapDrill !== null && afterTrapDrill > (beforeTrapDrill ?? 0),
    `taste shifted toward the LIKED beat's tags (${beforeTrapDrill} -> ${afterTrapDrill})`)
  assert.equal(afterJazz, beforeJazz, 'zero-overlap tags stay orthogonal (no phantom shift)')

  // the skipped beat is ALSO now invisible in the feed for the exclusion window
  const ids = (await getCandidates(user.id)).map(c => c.beatId)
  assert.ok(!ids.includes(beatTrapB3.id), 'recently skipped beat is excluded (seen-exclusion rule)')
})

// (c) events older than EVENT_WINDOW_DAYS have no effect
test('(c) an event older than 90 days has no effect', async () => {
  await resetUserEvents()
  const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000)
  await prisma.engagementEvent.create({
    data: { userId: user.id, beatId: beatJazzB2.id, type: 'LIKE', createdAt: old },
  })
  await rebuildUserVector(user.id)

  const rows = await prisma.$queryRaw<Array<{ v: string | null }>>`
    SELECT "tasteVector"::text AS v FROM "User" WHERE id = ${user.id}`
  assert.equal(rows[0]!.v, null, 'old event produced no taste vector (null)')

  const candidates = await getCandidates(user.id)
  assert.deepEqual(candidates, [], 'null taste -> empty candidates (old event had no effect)')

  // and the future-facing scorer treats an aged event similarly
  assert.equal(daysSince(new Date(Date.now() - 100 * 24 * 60 * 60 * 1000)) > 90, true)
})

// (d) follow bonus: only followed producers get it, and the score never tops 1
test('(d) follow bonus applies only to followed producers and caps at 1.0', async () => {
  // maxed-out components: similarity 1, affinity at max for both producers,
  // popularity maxed per beat via context, and recency for a beat uploaded now
  const shared: ScoreContext = {
    producerAffinities: { [producerA.id]: 5, [producerB.id]: 5 },
    maxProducerAffinity: 5,
    eventCountsPerBeat: {
      [beatTrapB1.id]: 10,
      [beatJazzB2.id]: 10,
    },
    maxEventCount: 10,
    followedProducerIds: [producerA.id],
  }
  const context: ScoreContext = {
    ...shared,
    followedProducerIds: [],
  }

  const base = (beat: typeof beatTrapB1, similarity = 1) =>
    scoreBeat(user.id, beat, similarity, context)

  const noFollow = base(beatTrapB1)
  // all components effectively maxed: 0.6 + 0.2 + ~0.1 + 0.1 ≈ 1.0
  assert.ok(Math.abs(noFollow - 1.0) < 1e-6, `maxed components score ~1.0 (got ${noFollow})`)
  assert.equal(noFollow <= 1.0, true, 'even maxed components never exceed 1.0')

  // followed producer (beatTrapB3, zero popularity count: 0/10 component) -
  // identical except for the FOLLOW_BONUS aggregated against the cap
  const followed = scoreBeat(
    user.id,
    { id: beatTrapB3.id, producerId: producerB.id, createdAt: beatTrapB3.createdAt },
    1,
    shared,
  )
  assert.ok(followed <= 1.0, `follow bonus capped at 1.0 (got ${followed})`)

  // with room below the cap, the followed-producer's score strictly wins:
  // zero out popularity for both via maxEventCount inflated
  const contextBigPop: ScoreContext = {
    ...shared,
    eventCountsPerBeat: { [beatTrapB1.id]: 0, [beatJazzB2.id]: 0 },
    maxEventCount: 100,
  }
  const followedNow = scoreBeat(
    user.id,
    { id: beatTrapB1.id, producerId: producerA.id, createdAt: beatTrapB1.createdAt },
    0.8,
    contextBigPop,
  )
  const notFollowedNow = scoreBeat(
    user.id,
    { id: beatTrapB3.id, producerId: producerB.id, createdAt: beatTrapB3.createdAt },
    0.8,
    contextBigPop,
  )
  assert.ok(followedNow > notFollowedNow, `follow bonus strictly helped followed producers (${followedNow} vs ${notFollowedNow})`)
  assert.ok(followedNow <= 1.0, 'still capped')
})

// (e) exclusions: own beats / seen-within-7-days / sold exclusives
test('(e) exclusions are respected in SQL', async () => {
  await resetUserEvents()
  await setTasteAtTrap()

  // user's own beat (they are producers too): excluded
  await prisma.user.update({
    where: { id: user.id },
    data: { role: 'PRODUCER' },
  })
  const own = await prisma.beat.create({
    data: { title: 'ZX Own Beat', audioKey: 'zxcheck/none.mp3', price: 9, producerId: user.id, tags: { connect: [{ id: tagTrap.id }] } },
  })
  await rebuildBeatVector(own.id)
  await prisma.user.update({ where: { id: user.id }, data: { role: 'ARTIST' } })

  // viewed recently: excluded
  await prisma.engagementEvent.create({
    data: { userId: user.id, beatId: beatTrapB3.id, type: 'PLAY_50' },
  })

  const ids = (await getCandidates(user.id)).map(c => c.beatId)
  assert.ok(!ids.includes(own.id), 'own beat excluded')
  assert.ok(!ids.includes(beatTrapB3.id), 'beat seen in the last 7 days excluded')
  assert.ok(!ids.includes(beatExclusiveB4.id), 'sold exclusive excluded')
  expectNoCandidates()
})

// (f) null tasteVector -> []
test('(f) empty array for a user with a null tasteVector', async () => {
  await resetUserEvents()
  await prisma.$executeRaw`UPDATE "User" SET "tasteVector" = NULL WHERE id = ${user.id}`
  assert.deepEqual(await getCandidates(user.id), [])
  assert.deepEqual(await rankCandidates(user.id), [])
})

after(async () => {
  // delete users first: beats/events cascade away with them
  for (const id of [user.id, producerA.id, producerB.id]) {
    await prisma.user.delete({ where: { id } }).catch(() => {})
  }
  // fixture tags are now orphaned and identifiable by the zxcheck prefix
  await prisma.tag.deleteMany({ where: { slug: { startsWith: 'zxcheck-' } } })
  await prisma.$disconnect()
})
