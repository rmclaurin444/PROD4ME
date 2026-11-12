/**
 * Dev-mode mass dataset seeder (CLI wrapper around lib/dev-seed.ts — the
 * /dev panel in the app calls the same engine).
 *
 *   node --env-file=.env scripts/seed-dev-dump.ts
 *   node --env-file=.env scripts/seed-dev-dump.ts --beats 500 --artists 20
 *   node --env-file=.env scripts/seed-dev-dump.ts --dir ./my-audio --seed 42
 *   node --env-file=.env scripts/seed-dev-dump.ts --clean   (purge only)
 *
 * Creates dev-*@prod4me.dev producers/artists, uploads REAL audio to MinIO —
 * drawn from the dev audio pool (files dropped into the /dev panel) when it
 * has content, else from --dir, else generated synthetic WAVs — genre-tags
 * every beat, simulates a biased listening history per artist, and rebuilds
 * all recommendation vectors. Purge with --clean (dev-* users only; the FK
 * cascade removes their beats/events/offers/payments/licenses).
 */
import { purgeDevDataset, seedDevDataset } from '../lib/dev-seed.ts'
import { prisma } from '../lib/prisma.ts'

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function argNumber(name: string, fallback: number): number {
  const raw = argValue(name)
  if (raw === undefined) return fallback
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) ? value : fallback
}

const isDirectRun = process.argv[1]?.includes('seed-dev-dump')
if (isDirectRun) {
  const cleanOnly = process.argv.includes('--clean')

  const run = cleanOnly
    ? purgeDevDataset().then(count => {
        console.log(`Purged ${count} dev-* users (beats, events, offers cascade-deleted).`)
      })
    : seedDevDataset({
        beats: Math.min(Math.max(argNumber('--beats', 200), 1), 2000),
        producers: Math.min(Math.max(argNumber('--producers', 8), 1), 50),
        artists: Math.min(Math.max(argNumber('--artists', 10), 1), 100),
        genres: (argValue('--genres') ?? 'trap,drill,house,lofi,ambient,jazz').split(','),
        eventsPerUser: Math.min(Math.max(argNumber('--events', 40), 0), 500),
        seed: argValue('--seed') ? argNumber('--seed', 42) : undefined,
        audioDir: argValue('--dir') ?? null,
      }).then(summary => {
        console.log(
          `Dev seed complete: ${summary.beats} beats, ${summary.producers} producers, ` +
            `${summary.artists} artists, ${summary.events} events ` +
            `(audio: ${summary.audioMode}, ${(summary.elapsedMs / 1000).toFixed(1)}s)`
        )
        console.log('Logins: dev-artist-N@prod4me.dev / dev-producer-N@prod4me.dev (password: password123)')
      })

  run
    .catch(e => {
      console.error('Dev seed failed:', e)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
