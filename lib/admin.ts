/**
 * Admin gate for the /dev panel. Admins are an email allowlist, deliberately
 * NOT a role — the `Role` enum (PRODUCER/ARTIST) stays untouched, and roles
 * are permanent at signup.
 *
 * Configured with a comma-separated `ADMIN_EMAILS` environment variable
 * (case-insensitive, entries trimmed). Empty or unset means nobody is an
 * admin — fail closed.
 */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email || email.trim() === '') return false
  const raw = process.env.ADMIN_EMAILS
  if (!raw || raw.trim() === '') return false
  const allowlist = raw
    .split(',')
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean)
  return allowlist.includes(email.trim().toLowerCase())
}
