/**
 * The app's public base URL (no trailing slash), used for every absolute
 * link the server builds: emails, Stripe redirect URLs, media URLs and
 * metadata. Never derived from request headers — `Origin`/`Host` can be
 * missing or forged, which would put wrong or malicious links in emails.
 *
 * Resolution order:
 *  1. APP_URL                         e.g. https://prod4me.studio
 *  2. https://${RAILWAY_PUBLIC_DOMAIN} (injected by Railway)
 *  3. http://localhost:3000            development only
 * Throws in production when none is set (lib/env.ts also fails at startup).
 */
export function getAppUrl(): string {
  const url = tryGetAppUrl()
  if (url) return url
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000'
  throw new Error('APP_URL (or RAILWAY_PUBLIC_DOMAIN) must be set in production')
}

/** Same resolution as getAppUrl() without the dev fallback; null when unset. */
export function tryGetAppUrl(): string | null {
  const explicit = process.env.APP_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim()
  if (railway) return `https://${railway.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`
  return null
}
