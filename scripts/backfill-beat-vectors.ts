/**
 * Backfills Beat.tagVector for every existing beat.
 *
 * Run: node --env-file=.env scripts/backfill-beat-vectors.ts
 */
import { prisma } from '../lib/prisma.ts'
import { rebuildBeatVector } from '../lib/recommendations/vectors.ts'

async function main() {
  const beats = await prisma.beat.findMany({ select: { id: true } })
  console.log(`Backfilling tagVector for ${beats.length} beats...`)

  let done = 0
  for (const beat of beats) {
    await rebuildBeatVector(beat.id)
    done += 1
    if (done % 25 === 0) console.log(`  ${done}/${beats.length}`)
  }

  console.log(`Done: ${done} beats vectorized.`)
}

main()
  .catch(e => {
    console.error('Backfill failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
