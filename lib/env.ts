/**
 * Production environment check, run once when the server starts
 * (instrumentation.ts). Collects EVERY missing variable and fails with one
 * clear message instead of failing later on the first request that needs it.
 *
 * Optional variables (features turn off cleanly when missing):
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, TWILIO_ACCOUNT_SID,
 *   TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID, DEV_PANEL,
 *   NEXT_PUBLIC_STUDIO_ENABLED, MINIO_REGION, MINIO_PORT, MINIO_USE_SSL,
 *   MINIO_PATH_STYLE, MEDIA_PROXY, EMAIL_CHECK_URL (unset/"off" skips the
 *   signup email check; the check also fails open if the validator is down)
 */
export const OPTIONAL_ENV = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_VERIFY_SERVICE_SID',
  'DEV_PANEL',
  'NEXT_PUBLIC_STUDIO_ENABLED',
  'MINIO_REGION',
  'MINIO_PORT',
  'MINIO_USE_SSL',
  'MINIO_PATH_STYLE',
  'MEDIA_PROXY',
  'EMAIL_CHECK_URL',
] as const

export const REQUIRED_ENV = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'AUTH_TRUST_HOST',
  'MINIO_ENDPOINT',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'MINIO_BUCKET_AUDIO',
  'MINIO_BUCKET_ARTWORK',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'CRON_SECRET',
  'ADMIN_EMAILS',
] as const

function isSet(name: string): boolean {
  const value = process.env[name]
  return typeof value === 'string' && value.trim() !== ''
}

/** Names of required variables that are missing or empty. */
export function missingEnv(): string[] {
  const missing: string[] = REQUIRED_ENV.filter(name => !isSet(name))
  if (!isSet('APP_URL') && !isSet('RAILWAY_PUBLIC_DOMAIN')) {
    missing.push('APP_URL (or RAILWAY_PUBLIC_DOMAIN)')
  }
  return missing
}

/**
 * Server startup hook (instrumentation.ts, Node runtime only): prints the
 * missing-variable list once and exits so Railway marks the deploy failed.
 */
export function enforceProductionEnv(): void {
  try {
    assertProductionEnv()
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}

/** Throws one error listing every missing variable (production only). */
export function assertProductionEnv(): void {
  if (process.env.NODE_ENV !== 'production') return
  const missing = missingEnv()
  if (missing.length === 0) return
  throw new Error(
    [
      `PROD4ME cannot start: ${missing.length} required environment variable(s) missing:`,
      ...missing.map(name => `  - ${name}`),
      'Set them on the Railway web service (Variables tab) or in .env, then redeploy. See .env.example and DEPLOY.md.',
    ].join('\n')
  )
}
