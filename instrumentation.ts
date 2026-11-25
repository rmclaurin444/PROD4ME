/**
 * Runs once when a Next.js server instance starts (`next start`), before it
 * handles requests. Validates production environment variables so a missing
 * variable fails the deploy loudly with one message listing all of them.
 */
export async function register() {
  // `next build` also loads the app; only check when actually serving.
  if (process.env.NEXT_PHASE === 'phase-production-build') return

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Node-only code lives in the dynamically imported module so it never
    // reaches the Edge bundle.
    const { enforceProductionEnv } = await import('./lib/env')
    enforceProductionEnv()
  }
}
