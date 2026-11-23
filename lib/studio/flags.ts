/**
 * Studio feature flag. Default OFF: `/studio` renders the Coming Soon screen
 * for every role and the feed hides its Open/Try in Studio entry points.
 *
 * Set NEXT_PUBLIC_STUDIO_ENABLED=1 to run the existing Studio UI. Because the
 * value is a `NEXT_PUBLIC_` variable, Next.js inlines it at build time — it
 * must be set when `next build` runs (dev picks it up per session).
 */
export const STUDIO_ENABLED = process.env.NEXT_PUBLIC_STUDIO_ENABLED === '1'
