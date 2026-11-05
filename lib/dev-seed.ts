/**
 * Dev-mode dataset seeder — the engine behind the CLI script
 * (scripts/seed-dev-dump.ts) and the /dev panel API routes.
 *
 * Creates throwaway `dev-*@prod4me.dev` accounts, uploads REAL audio to
 * MinIO — drawn from the dev audio pool (files dropped into the /dev panel,
 * stored under `audio/dev-pool/`), or a CLI `--dir` folder, or generated
 * synthetic WAVs when neither exists — builds genre-tagged beats with
 * plausible metadata, simulates a biased listening history per artist so
 * taste vectors form real clusters, and rebuilds all recommendation vectors
 * through the production pipeline (lib/recommendations) so the feed can be
 * tested end-to-end.
 *
 * Everything is namespaced under the `dev-` email prefix: purgeDevDataset()
 * deletes those users and the FK cascade removes their beats, events,
 * offers, payments and licenses. Tags are shared vocabulary and survive.
 */
import bcrypt from 'bcryptjs'
import { prisma } from './prisma.ts'
import {
  BUCKET_AUDIO,
  copyObject,
  deleteObject,
  listObjectEntries,
  putObject,
} from './storage.ts'
import { rebuildBeatVector, rebuildUserVector } from './recommendations/vectors.ts'
import type { EventTypeName } from './recommendations/constants.ts'

// ---------------------------------------------------------------------------
// guard
// ---------------------------------------------------------------------------

/** The /dev panel and its API routes exist only outside production (or when
 *  explicitly opted in via DEV_PANEL=1). */
export function devPanelEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.DEV_PANEL === '1'
}

// ---------------------------------------------------------------------------
// deterministic randomness
// ---------------------------------------------------------------------------

/** mulberry32 — tiny seeded PRNG so `--seed 42` reproduces a dataset. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1))
}

function pick<T>(rand: () => number, list: readonly T[]): T {
  return list[Math.floor(rand() * list.length)]!
}

function pickWeighted<T>(rand: () => number, entries: { value: T; weight: number }[]): T {
  const total = entries.reduce((sum, e) => sum + e.weight, 0)
  let roll = rand() * total
  for (const entry of entries) {
    roll -= entry.weight
    if (roll <= 0) return entry.value
  }
  return entries[entries.length - 1]!.value
}

// ---------------------------------------------------------------------------
// genre profiles (plausible metadata per genre)
// ---------------------------------------------------------------------------

type GenreProfile = { bpm: [number, number]; keys: string[] }

const COMMON_KEYS = ['A minor', 'C minor', 'E minor', 'F# minor', 'G minor', 'B minor', 'D minor']

const GENRE_PROFILES: Record<string, GenreProfile> = {
  trap: { bpm: [130, 150], keys: COMMON_KEYS },
  drill: { bpm: [138, 148], keys: COMMON_KEYS },
  house: { bpm: [120, 128], keys: ['A minor', 'C minor', 'F minor', 'G minor'] },
  techno: { bpm: [128, 140], keys: ['A minor', 'F minor', 'G minor'] },
  dnb: { bpm: [168, 176], keys: COMMON_KEYS },
  dubstep: { bpm: [138, 145], keys: COMMON_KEYS },
  lofi: { bpm: [70, 90], keys: ['A minor', 'C major', 'E minor', 'F major'] },
  ambient: { bpm: [60, 90], keys: ['C major', 'A minor', 'D major'] },
  'boom-bap': { bpm: [85, 95], keys: COMMON_KEYS },
  rnb: { bpm: [90, 105], keys: COMMON_KEYS },
  pop: { bpm: [100, 125], keys: ['C major', 'G major', 'A minor', 'F major'] },
  jazz: { bpm: [95, 140], keys: COMMON_KEYS },
  reggaeton: { bpm: [90, 100], keys: ['A minor', 'C minor', 'G minor'] },
  afrobeats: { bpm: [98, 112], keys: COMMON_KEYS },
}

const FALLBACK_PROFILE: GenreProfile = { bpm: [90, 140], keys: COMMON_KEYS }

export function genreProfile(name: string): GenreProfile {
  return GENRE_PROFILES[name.toLowerCase().trim()] ?? FALLBACK_PROFILE
}

// ---------------------------------------------------------------------------
// synthetic audio (valid, playable WAV — no external assets needed)
// ---------------------------------------------------------------------------

function wrapWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28) // byte rate (16-bit)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

/** A short lo-fi-ish loop: kick pulses + bass drone + hat noise. */
export function makeSyntheticWav(seed: number, seconds = 12, sampleRate = 11025): Buffer {
  const rand = mulberry32(seed)
  const total = seconds * sampleRate
  const pcm = Buffer.alloc(total * 2)
  const bpm = 80 + Math.floor(rand() * 60)
  const beatLen = (60 / bpm) * sampleRate
  const root = 55 * Math.pow(2, Math.floor(rand() * 12) / 12)

  for (let i = 0; i < total; i++) {
    const t = i / sampleRate
    const beatPos = (i % beatLen) / beatLen
    const kick = Math.sin(2 * Math.PI * (55 - 30 * beatPos) * t) * Math.exp(-beatPos * 8) * 0.9
    const hat = (rand() * 2 - 1) * (beatPos < 0.08 ? 0.15 : 0.02)
    const bass = Math.sin(2 * Math.PI * root * t) * 0.25
    const v = Math.max(-1, Math.min(1, kick + hat + bass))
    pcm.writeInt16LE(Math.round(v * 32000), i * 2)
  }
  return wrapWav(pcm, sampleRate)
}

/** WAV → exact duration from the header; lossy formats → estimate at 128kbps. */
export function estimateDurationSec(bytes: Buffer, ext: string): number | null {
  if ((ext === 'wav' || ext === 'wave') && bytes.length > 44) {
    const byteRate = bytes.readUInt32LE(28)
    if (byteRate > 0) return Math.round((bytes.length - 44) / byteRate)
  }
  return Math.max(1, Math.round((bytes.length * 8) / 128000))
}

// ---------------------------------------------------------------------------
// metadata helpers
// ---------------------------------------------------------------------------

const TITLE_A = [
  'Midnight', 'Neon', 'Ghost', 'Velvet', 'Chrome', 'Static', 'Hollow', 'Golden',
  'Broken', 'Silent', 'Crystal', 'Savage', 'Lucid', 'Faded', 'Wild', 'Paper',
]
const TITLE_B = [
  'Drift', 'Ritual', 'Bounce', 'Haze', 'Circuit', 'Mirage', 'Anthem', 'Sermon',
  'Pulse', 'Requiem', 'Bloom', 'Storm', 'Signal', 'Vice', 'Motion', 'Dust',
]

function randomTitle(rand: () => number): string {
  return `${pick(rand, TITLE_A)} ${pick(rand, TITLE_B)}`
}

/** Waveform-looking 128-bar peaks (random walk with loud/quiet sections). */
function makePeaks(rand: () => number, bars = 128): number[] {
  const peaks: number[] = []
  let level = 0.5
  for (let i = 0; i < bars; i++) {
    if (i % 8 === 0) level = 0.25 + rand() * 0.7
    level = Math.min(1, Math.max(0.05, level + (rand() - 0.5) * 0.25))
    peaks.push(Math.round(level * 1000) / 1000)
  }
  return peaks
}

const EXT_TO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aiff: 'audio/aiff',
  aif: 'audio/aiff',
  flac: 'audio/flac',
}

export function mimeForExtension(ext: string): string | null {
  return EXT_TO_MIME[ext.toLowerCase()] ?? null
}

/** Shared validation for dropped files (dump-as-beat and pool paths). */
function validateAudioFile(file: DumpFileInput): { ext: string; mime: string } {
  const ext = file.filename.split('.').pop()?.toLowerCase() ?? ''
  if (!AUDIO_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported audio extension: .${ext || '(none)'}`)
  }
  const mime = file.contentType?.startsWith('audio/') ? file.contentType : mimeForExtension(ext)
  if (!mime) throw new Error(`Unsupported audio type: ${file.contentType ?? ext}`)
  return { ext: ext === 'wave' ? 'wav' : ext, mime }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ---------------------------------------------------------------------------
// audio sources
// ---------------------------------------------------------------------------

const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'aif', 'aiff', 'flac'])

/** Loads a folder of real audio files into memory (capped) for the seeder. */
export async function loadAudioDir(
  dir: string,
  log: (msg: string) => void,
): Promise<{ name: string; ext: string; bytes: Buffer }[]> {
  const { readdir, readFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const entries = await readdir(dir)
  const files: { name: string; ext: string; bytes: Buffer }[] = []
  for (const name of entries) {
    const ext = name.split('.').pop()?.toLowerCase() ?? ''
    if (!AUDIO_EXTENSIONS.has(ext)) continue
    const bytes = await readFile(join(dir, name))
    files.push({ name, ext, bytes })
    if (files.length >= 40) break // cap memory; files cycle across beats anyway
  }
  log(`Loaded ${files.length} audio file(s) from ${dir}`)
  return files
}

/** One synthetic WAV per genre flavour, cycled across beats. */
function makeSyntheticPool(genres: string[], rand: () => number): { name: string; ext: string; bytes: Buffer }[] {
  const sourceGenres = genres.length > 0 ? genres : ['dev']
  return sourceGenres.map((genre, i) => ({
    name: `synthetic-${slugify(genre)}.wav`,
    ext: 'wav',
    bytes: makeSyntheticWav(randInt(rand, 1, 1e9) + i * 7919),
  }))
}

// ---------------------------------------------------------------------------
// dev audio pool (dropped files the seeder draws from)
// ---------------------------------------------------------------------------

export const AUDIO_POOL_PREFIX = 'audio/dev-pool/'

/** Stages one dropped file into the pool — no beat is created. */
export async function addToAudioPool(file: DumpFileInput): Promise<{ key: string; size: number }> {
  const { ext, mime } = validateAudioFile(file)
  const key = `${AUDIO_POOL_PREFIX}${crypto.randomUUID()}.${ext}`
  await putObject(BUCKET_AUDIO, key, file.bytes, mime)
  return { key, size: file.bytes.length }
}

export type PoolEntry = { key: string; size: number; ext: string }

export async function listAudioPool(): Promise<PoolEntry[]> {
  const entries = await listObjectEntries(BUCKET_AUDIO, AUDIO_POOL_PREFIX)
  return entries.map(entry => ({
    ...entry,
    ext: entry.key.split('.').pop()?.toLowerCase() ?? '',
  }))
}

export async function clearAudioPool(): Promise<number> {
  const entries = await listAudioPool()
  for (const entry of entries) {
    await deleteObject(BUCKET_AUDIO, entry.key)
  }
  return entries.length
}

/** One audio source for a seeded beat: either in-memory bytes (CLI folder /
 *  synthetic) or a MinIO pool key that gets copied server-side. */
type AudioSrc = {
  name: string
  ext: string
  bytes: Buffer | null
  poolKey: string | null
  sizeBytes: number
}

/** Shuffles pool entries with the seeded PRNG. Pool files are MinIO copy
 *  SOURCES — their bytes never flow through Node, so any pool size is fine. */
function shufflePoolEntries(entries: PoolEntry[], rand: () => number): PoolEntry[] {
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[entries[i], entries[j]] = [entries[j]!, entries[i]!]
  }
  return entries
}

/** Duration estimate from file size alone (assumes ~128kbps lossy). */
function estimateDurationFromSize(sizeBytes: number): number {
  return Math.max(1, Math.round((sizeBytes * 8) / 128000))
}
// ---------------------------------------------------------------------------
// seed dataset
// ---------------------------------------------------------------------------

export type SeedOptions = {
  beats: number
  producers: number
  artists: number
  genres: string[]
  eventsPerUser: number
  seed?: number
  audioDir?: string | null
  log?: (msg: string) => void
}

export type SeedAccount = { email: string; role: string; interests: string[] }

export type SeedSummary = {
  producers: number
  artists: number
  beats: number
  events: number
  genres: string[]
  audioMode: 'pool' | 'files' | 'synthetic'
  elapsedMs: number
  accounts: SeedAccount[]
}

const SIM_EVENT_MIX: { value: EventTypeName; weight: number }[] = [
  { value: 'PLAY_50', weight: 30 },
  { value: 'PLAY_COMPLETE', weight: 20 },
  { value: 'LIKE', weight: 14 },
  { value: 'SAVE', weight: 10 },
  { value: 'TAG_TAP', weight: 10 },
  { value: 'COMMENT', weight: 4 },
  { value: 'SKIP', weight: 12 },
]

export async function seedDevDataset(opts: SeedOptions): Promise<SeedSummary> {
  const log = opts.log ?? ((msg: string) => console.log(msg))
  const started = Date.now()
  const rand = mulberry32(opts.seed ?? Date.now() % 1e9)
  const password = bcrypt.hashSync('password123', 10)
  const genres = opts.genres.map(g => g.trim()).filter(Boolean)
  const genreNames = genres.length > 0 ? genres : ['dev-dump']

  // ---- audio source: dev pool → --dir folder → synthetic WAVs ----
  const poolEntries = await listAudioPool()
  let audioMode: 'pool' | 'files' | 'synthetic'
  let pool: AudioSrc[]
  if (poolEntries.length > 0) {
    pool = shufflePoolEntries(poolEntries, rand).map(entry => ({
      name: entry.key.split('/').pop() ?? entry.key,
      ext: entry.ext === 'wave' ? 'wav' : entry.ext,
      bytes: null,
      poolKey: entry.key,
      sizeBytes: entry.size,
    }))
    audioMode = 'pool'
    log(`Audio mode: pool (${pool.length} file(s), copied server-side, cycled)`)
  } else {
    const audioFiles =
      opts.audioDir != null && opts.audioDir !== ''
        ? await loadAudioDir(opts.audioDir, log)
        : []
    pool = audioFiles.map(file => ({
      name: file.name,
      ext: file.ext,
      bytes: file.bytes,
      poolKey: null,
      sizeBytes: file.bytes.length,
    }))
    if (pool.length === 0) {
      pool = makeSyntheticPool(genreNames, rand).map(file => ({
        name: file.name,
        ext: file.ext,
        bytes: file.bytes,
        poolKey: null,
        sizeBytes: file.bytes.length,
      }))
    }
    audioMode = pool[0]!.poolKey === null && pool[0]!.name.startsWith('synthetic-') ? 'synthetic' : 'files'
    log(`Audio mode: ${audioMode} (${pool.length} file(s) cycled)`)
  }

  // ---- producers ----
  log(`Creating ${opts.producers} dev producers...`)
  const producerIds: string[] = []
  for (let i = 1; i <= opts.producers; i++) {
    const user = await prisma.user.upsert({
      where: { email: `dev-producer-${i}@prod4me.dev` },
      update: {},
      create: {
        email: `dev-producer-${i}@prod4me.dev`,
        name: `Dev Producer ${i}`,
        password,
        role: 'PRODUCER',
        bio: 'Dev seed producer.',
      },
    })
    producerIds.push(user.id)
  }

  // ---- tags ----
  const tagRows = []
  for (const name of genreNames) {
    tagRows.push(
      await prisma.tag.upsert({
        where: { slug: slugify(name) },
        update: {},
        create: { name: name.toLowerCase(), slug: slugify(name), type: 'GENRE' },
      }),
    )
  }

  // ---- beats ----
  log(`Creating ${opts.beats} beats...`)
  const beatIds: string[] = []
  for (let i = 0; i < opts.beats; i++) {
    const src = pool[i % pool.length]!
    const genreName = genreNames[i % genreNames.length]!
    const profile = genreProfile(genreName)
    const producerId = producerIds[i % producerIds.length]!
    const audioKey = `audio/${producerId}/${crypto.randomUUID()}.${src.ext}`
    if (src.poolKey) {
      // pool file: copy inside MinIO — no bytes flow through the app server
      await copyObject(BUCKET_AUDIO, audioKey, src.poolKey)
    } else {
      await putObject(
        BUCKET_AUDIO,
        audioKey,
        src.bytes!,
        mimeForExtension(src.ext) ?? 'application/octet-stream'
      )
    }

    const free = rand() < 0.15
    const price = free ? 0 : randInt(rand, 5, 49)
    const hasExclusive = !free && rand() < 0.2
    const tagCount = Math.min(tagRows.length, randInt(rand, 1, 3))
    const tagIds = [tagRows[i % tagRows.length]!.id]
    while (tagIds.length < tagCount) {
      const extra = pick(rand, tagRows).id
      if (!tagIds.includes(extra)) tagIds.push(extra)
    }

    const beat = await prisma.beat.create({
      data: {
        title: `${randomTitle(rand)} #${i + 1}`,
        bpm: randInt(rand, profile.bpm[0], profile.bpm[1]),
        musicalKey: pick(rand, profile.keys),
        price,
        exclusivePriceCents: hasExclusive ? randInt(rand, 199, 999) * 100 : null,
        audioKey,
        peaks: makePeaks(rand),
        durationSec: src.bytes
          ? estimateDurationSec(src.bytes, src.ext)
          : estimateDurationFromSize(src.sizeBytes),
        producerId,
        tags: { connect: tagIds.map(id => ({ id })) },
      },
    })
    beatIds.push(beat.id)
    if ((i + 1) % 25 === 0) log(`  ${i + 1}/${opts.beats} beats`)
  }

  // tag vectors + useCount
  log('Rebuilding beat vectors...')
  for (let i = 0; i < beatIds.length; i++) {
    await rebuildBeatVector(beatIds[i]!)
    if ((i + 1) % 50 === 0) log(`  ${i + 1}/${beatIds.length} vectors`)
  }
  for (const tag of tagRows) {
    const count = await prisma.beat.count({ where: { tags: { some: { id: tag.id } } } })
    await prisma.tag.update({ where: { id: tag.id }, data: { useCount: count } })
  }

  // ---- artists + simulated engagement ----
  log(`Creating ${opts.artists} dev artists with simulated listening history...`)
  const accounts: SeedAccount[] = []
  let totalEvents = 0
  const windowMs = 14 * 24 * 60 * 60 * 1000 // spread events over the last 14 days

  // which of the new beats overlap which tags (for the affinity bias below)
  const beatTagRows = await prisma.beat.findMany({
    where: { id: { in: beatIds } },
    select: { id: true, tags: { select: { id: true } } },
  })

  for (let a = 1; a <= opts.artists; a++) {
    const interestTags = [pick(rand, tagRows)]
    while (interestTags.length < Math.min(tagRows.length, randInt(rand, 1, 3))) {
      const extra = pick(rand, tagRows)
      if (!interestTags.some(t => t.id === extra.id)) interestTags.push(extra)
    }
    const interestIds = interestTags.map(t => t.id)

    const affinityIds: string[] = []
    const neutralIds: string[] = []
    for (const row of beatTagRows) {
      if (row.tags.some(tag => interestIds.includes(tag.id))) affinityIds.push(row.id)
      else neutralIds.push(row.id)
    }
    // ~75/25 affinity bias via weighted pool
    const weightedPool = [
      ...affinityIds.map(id => ({ value: id, weight: 3 })),
      ...neutralIds.map(id => ({ value: id, weight: 1 })),
    ]

    // upsert manually so interestCount is bumped exactly once per fresh user
    const existing = await prisma.user.findUnique({ where: { email: `dev-artist-${a}@prod4me.dev` } })
    const artist =
      existing ??
      (await prisma.user.create({
        data: {
          email: `dev-artist-${a}@prod4me.dev`,
          name: `Dev Artist ${a}`,
          password,
          role: 'ARTIST',
          bio: 'Dev seed artist.',
          interests: { connect: interestIds.map(id => ({ id })) },
        },
      }))
    if (!existing) {
      await prisma.tag.updateMany({
        where: { id: { in: interestIds } },
        data: { interestCount: { increment: 1 } },
      })
    }

    const engagedBeatIds = new Set<string>()
    const eventRows = []
    for (let e = 0; e < opts.eventsPerUser; e++) {
      const beatId = weightedPool.length > 0 ? pickWeighted(rand, weightedPool) : pick(rand, beatIds)
      engagedBeatIds.add(beatId)
      eventRows.push({
        userId: artist.id,
        beatId,
        type: pickWeighted(rand, SIM_EVENT_MIX),
        createdAt: new Date(Date.now() - rand() * windowMs),
      })
    }
    if (eventRows.length > 0) {
      await prisma.engagementEvent.createMany({ data: eventRows })
      totalEvents += eventRows.length
    }

    // 1-2 producer follows on beats they engaged with
    const followTargets = [...engagedBeatIds].slice(0, randInt(rand, 1, 2))
    for (const beatId of followTargets) {
      await prisma.engagementEvent.create({
        data: { userId: artist.id, beatId, type: 'FOLLOW_PRODUCER' },
      })
      totalEvents += 1
    }

    await rebuildUserVector(artist.id)
    accounts.push({
      email: artist.email,
      role: 'ARTIST',
      interests: interestTags.map(t => t.name),
    })
  }

  for (let i = 1; i <= opts.producers; i++) {
    accounts.push({ email: `dev-producer-${i}@prod4me.dev`, role: 'PRODUCER', interests: [] })
  }

  const elapsedMs = Date.now() - started
  log(`Done in ${(elapsedMs / 1000).toFixed(1)}s`)
  return {
    producers: opts.producers,
    artists: opts.artists,
    beats: beatIds.length,
    events: totalEvents,
    genres: genreNames,
    audioMode,
    elapsedMs,
    accounts,
  }
}

// ---------------------------------------------------------------------------
// purge
// ---------------------------------------------------------------------------

export async function purgeDevDataset(): Promise<number> {
  const { count } = await prisma.user.deleteMany({ where: { email: { startsWith: 'dev-' } } })
  return count
}

// ---------------------------------------------------------------------------
// single-file dump (drag-and-drop path)
// ---------------------------------------------------------------------------

export type DumpFileInput = { filename: string; contentType: string | null; bytes: Buffer }

export type DumpResult = {
  beatId: string
  title: string
  audioKey: string
  tags: string[]
  durationSec: number | null
}

const DUMPER_EMAIL = 'dev-dumper@prod4me.dev'

/** Uploads one dropped audio file to MinIO and creates a fully playable beat
 *  with random metadata. Falls back to a designated `dev-dumper` producer
 *  account when the caller doesn't pass one. */
export async function dumpAudioFile(
  file: DumpFileInput,
  opts: { genres?: string[]; producerId?: string | null } = {},
): Promise<DumpResult> {
  const { ext: normalizedExt, mime } = validateAudioFile(file)

  // resolve producer
  let producerId = opts.producerId ?? null
  if (producerId) {
    const producer = await prisma.user.findUnique({ where: { id: producerId }, select: { role: true } })
    if (!producer || producer.role !== 'PRODUCER') producerId = null
  }
  if (!producerId) {
    const dumper = await prisma.user.upsert({
      where: { email: DUMPER_EMAIL },
      update: {},
      create: {
        email: DUMPER_EMAIL,
        name: 'Dev Dumper',
        password: bcrypt.hashSync('password123', 10),
        role: 'PRODUCER',
        bio: 'Drag-and-drop dump target.',
      },
    })
    producerId = dumper.id
  }

  const audioKey = `audio/${producerId}/${crypto.randomUUID()}.${normalizedExt}`
  await putObject(BUCKET_AUDIO, audioKey, file.bytes, mime)

  const genres = (opts.genres ?? []).map(g => g.trim()).filter(Boolean)
  const tagNames = genres.length > 0 ? genres : ['dev-dump']
  const rand = mulberry32(Math.floor(Math.random() * 1e9))
  const profile = genreProfile(pick(rand, tagNames))
  const free = rand() < 0.15
  const price = free ? 0 : randInt(rand, 5, 49)

  const beat = await prisma.beat.create({
    data: {
      title: file.filename.replace(/\.[^.]+$/, '').slice(0, 60) || randomTitle(rand),
      bpm: randInt(rand, profile.bpm[0], profile.bpm[1]),
      musicalKey: pick(rand, profile.keys),
      price,
      exclusivePriceCents: !free && rand() < 0.2 ? randInt(rand, 199, 999) * 100 : null,
      audioKey,
      peaks: makePeaks(rand),
      durationSec: estimateDurationSec(file.bytes, normalizedExt),
      producerId,
      tags: {
        connectOrCreate: tagNames.slice(0, 3).map(name => ({
          where: { slug: slugify(name) },
          create: { name: name.toLowerCase(), slug: slugify(name), type: 'GENRE' },
        })),
      },
    },
  })

  const createdTags = await prisma.tag.findMany({
    where: { beats: { some: { id: beat.id } } },
    select: { id: true },
  })
  for (const tag of createdTags) {
    await prisma.tag.update({ where: { id: tag.id }, data: { useCount: { increment: 1 } } })
  }
  await rebuildBeatVector(beat.id)

  return {
    beatId: beat.id,
    title: beat.title,
    audioKey,
    tags: tagNames.slice(0, 3),
    durationSec: beat.durationSec,
  }
}

// ---------------------------------------------------------------------------
// stats (for the panel's overview)
// ---------------------------------------------------------------------------

export type DevStats = {
  users: number
  beats: number
  events: number
  poolFiles: number
  poolBytes: number
}

export async function devDatasetStats(): Promise<DevStats> {
  const [users, beats, events, pool] = await Promise.all([
    prisma.user.count({ where: { email: { startsWith: 'dev-' } } }),
    prisma.beat.count({ where: { producer: { email: { startsWith: 'dev-' } } } }),
    prisma.engagementEvent.count({ where: { user: { email: { startsWith: 'dev-' } } } }),
    listAudioPool(),
  ])
  return {
    users,
    beats,
    events,
    poolFiles: pool.length,
    poolBytes: pool.reduce((sum, entry) => sum + entry.size, 0),
  }
}
