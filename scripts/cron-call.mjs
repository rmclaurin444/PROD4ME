#!/usr/bin/env node
/**
 * Calls one of the app's cron routes, e.g.:
 *
 *   node scripts/cron-call.mjs expire-offers
 *   node scripts/cron-call.mjs leaderboard
 *
 * Reads APP_URL (or RAILWAY_PUBLIC_DOMAIN) and CRON_SECRET from the
 * environment. Dependency-free (Node 18+ global fetch). Exits 0 on a 2xx
 * response and 1 otherwise, so failures show up in Railway's cron history.
 * Locally: node --env-file=.env scripts/cron-call.mjs leaderboard
 */

const job = process.argv[2]
if (!job || !/^[a-z0-9-]+$/.test(job)) {
  console.error('Usage: node scripts/cron-call.mjs <job>   (expire-offers | leaderboard)')
  process.exit(1)
}

const base =
  process.env.APP_URL?.trim() ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN.trim()}` : '')
const secret = process.env.CRON_SECRET

if (!base || !secret) {
  console.error('cron-call: APP_URL (or RAILWAY_PUBLIC_DOMAIN) and CRON_SECRET must be set')
  process.exit(1)
}

const url = `${base.replace(/\/+$/, '')}/api/cron/${job}`

try {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(60_000),
  })
  const body = await response.text()
  console.log(`cron-call ${job}: ${response.status} ${response.statusText}`)
  console.log(body)
  process.exit(response.ok ? 0 : 1)
} catch (error) {
  console.error(`cron-call ${job}: request failed —`, error instanceof Error ? error.message : error)
  process.exit(1)
}
