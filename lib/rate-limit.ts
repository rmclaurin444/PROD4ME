import { prisma } from './prisma.ts'

/**
 * Postgres-backed fixed-window rate limiter. Counts survive restarts and
 * deploys and are shared across replicas (the old in-memory Maps were not).
 *
 * One atomic upsert per call: the row for (key, current window) is created
 * with count 1 or incremented, and the new count is returned. A request is
 * allowed while count <= limit. Rows older than 24 hours are deleted by the
 * hourly expire-offers cron (deleteOldRateLimits).
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ ok: boolean; retryAfterSec: number }> {
  const now = Date.now()
  const windowStartMs = Math.floor(now / windowMs) * windowMs
  const windowStart = new Date(windowStartMs)

  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimit" ("key", "windowStart", "count")
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key", "windowStart")
    DO UPDATE SET "count" = "RateLimit"."count" + 1
    RETURNING "count"
  `
  const count = Number(rows[0]?.count ?? 1)
  const retryAfterSec = Math.max(1, Math.ceil((windowStartMs + windowMs - now) / 1000))
  return { ok: count <= limit, retryAfterSec }
}

/** First address in x-forwarded-for (Railway's proxy sets it), else 'local'. */
export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
}

/** Cleanup for the cron: drops windows that started more than 24 hours ago. */
export async function deleteOldRateLimits(): Promise<number> {
  const result = await prisma.rateLimit.deleteMany({
    where: { windowStart: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  })
  return result.count
}
