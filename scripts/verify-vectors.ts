/** Throwaway verification for Task 2 vector semantics. Run:
 *  node --env-file=.env scripts/verify-vectors.ts
 */
import { prisma } from '../lib/prisma.ts'
import { rebuildUserVector } from '../lib/recommendations/vectors.ts'

function parseVector(value: unknown): number[] {
  if (typeof value !== 'string') throw new Error('vector not string: ' + typeof value)
  return value.replace('[', '').replace(']', '').split(',').map(Number)
}

async function main() {
  // pick a beat with exactly one tag if possible
  const beats = await prisma.beat.findMany({
    select: { id: true, title: true, tags: { select: { slug: true, vectorIndex: true } } },
  })
  const single = beats.find(b => b.tags.length === 1)
  const target = single ?? beats[0]!
  console.log('engaging beat:', target.title, 'tags:', target.tags.map(t => t.slug).join(','))

  // 1) beat vector checks
  const beatRows = await prisma.$queryRaw<Array<{ id: string; v: unknown }>>`
    SELECT id, "tagVector"::text AS v FROM "Beat" WHERE id = ${target.id}`
  const beatVec = parseVector(beatRows[0]!.v)
  let norm = 0
  for (const x of beatVec) norm += x * x
  norm = Math.sqrt(norm)
  console.log('beat vector: dims', beatVec.length, 'norm', norm.toFixed(6))

  // expected: 1/sqrt(n) at each tag slot
  const slots = target.tags.filter((t): t is { slug: string; vectorIndex: number } => t.vectorIndex !== null)
  const expected = slots.map(t => ({ slug: t.slug, value: beatVec[t.vectorIndex!] }))
  console.log('beat values at tag slots:', expected.map(e => e.slug + '=' + e.value.toFixed(4)).join(' '))

  // 2) user taste vector: one user, one engagement on the target beat
  const tmpEmail = `veccheck-${Date.now()}@test.dev`
  const tmpUser = await prisma.user.create({
    data: { email: tmpEmail, password: 'noop', name: 'VerChk', role: 'ARTIST' },
  })
  await prisma.engagementEvent.create({
    data: { userId: tmpUser.id, beatId: target.id, type: 'LIKE' },
  })
  await rebuildUserVector(tmpUser.id)

  const userRows = await prisma.$queryRaw<Array<{ id: string; v: unknown }>>`
    SELECT id, "tasteVector"::text AS v FROM "User" WHERE id = ${tmpUser.id}`
  const tasteVec = parseVector(userRows[0]!.v)
  let tnorm = 0
  for (const x of tasteVec) tnorm += x * x
  tnorm = Math.sqrt(tnorm)
  console.log('taste vector: dims', tasteVec.length, 'norm', tnorm.toFixed(6))

  // cosine similarity between beat and taste vectors (SQL-side <=> distance)
  const distRows = await prisma.$queryRaw<Array<{ d: number }>>`
    SELECT ("tagVector" <=> "tasteVector")::text AS d
    FROM "Beat" b CROSS JOIN "User" u
    WHERE b.id = ${target.id} AND u.id = ${tmpUser.id}`
  console.log('cosine distance beat<->taste:', distRows[0]!.d, '(should be ~0)')

  // 3) comment the temporary user (events cascade)
  await prisma.user.delete({ where: { id: tmpUser.id } })
  console.log('cleanup: temp user deleted')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
