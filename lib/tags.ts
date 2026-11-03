import { prisma } from '@/lib/prisma'

/**
 * Genre handling shared by signup, tag autocomplete, and future profile
 * editing. Genres are Tag rows with type=GENRE so a user's interests can be
 * matched directly against a beat's tags (the column `type` exists to allow
 * other tag categories later, e.g. STYLE).
 */

export const MAX_GENRES = 6
export const MAX_GENRE_LENGTH = 40

export type NormalizedGenre = { name: string; slug: string }

export function slugifyGenre(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Validates and normalizes a raw genres payload (e.g. from the signup step).
 * Returns `error: null` when the input is absent or valid, and a message
 * otherwise. By design this mirrors the beat-tag rules: free-form, trimmed,
 * deduped case-insensitively via slug.
 */
export function normalizeGenres(
  values: unknown,
  max = MAX_GENRES,
): { genres: NormalizedGenre[]; error: string | null } {
  if (values === undefined || values === null) {
    return { genres: [], error: null }
  }

  if (!Array.isArray(values)) {
    return { genres: [], error: 'Genres must be a list of strings' }
  }

  const genres: NormalizedGenre[] = []
  const seen = new Set<string>()

  for (const raw of values) {
    if (typeof raw !== 'string') {
      return { genres: [], error: 'Each genre must be a string' }
    }

    const name = raw.trim().toLowerCase()
    if (name.length === 0) continue

    if (name.length > MAX_GENRE_LENGTH) {
      return { genres: [], error: `Each genre must be at most ${MAX_GENRE_LENGTH} characters` }
    }

    const slug = slugifyGenre(name)
    if (!slug) continue

    if (seen.has(slug)) continue

    if (genres.length >= max) {
      return { genres: [], error: `You can pick up to ${max} genres` }
    }

    seen.add(slug)
    genres.push({ name, slug })
  }

  return { genres, error: null }
}

/**
 * Fetch-or-create GENRE Tag rows. Uses createMany-style upserts in one
 * transaction so two users coining the same genre share one row.
 */
export async function getOrCreateGenreTags(genres: NormalizedGenre[]) {
  if (genres.length === 0) return []

  return prisma.$transaction(
    genres.map(genre =>
      prisma.tag.upsert({
        where: { slug: genre.slug },
        update: {},
        create: { name: genre.name, slug: genre.slug, type: 'GENRE' },
      }),
    ),
  )
}

/** Bumps the "how many users picked this" counter by one per user picking it. */
export function incrementGenreInterestCounts(tagIds: string[]) {
  if (tagIds.length === 0) return Promise.resolve()
  return prisma.tag.updateMany({
    where: { id: { in: tagIds } },
    data: { interestCount: { increment: 1 } },
  })
}
