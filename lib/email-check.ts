/**
 * Email address check before the verification email is sent: syntax, domain
 * and MX records, and known throwaway domains, plus typo suggestions
 * ("gmial.com" → "gmail.com"). It does NOT prove an inbox exists — the
 * emailed verification link still does that.
 *
 * Calls OUR OWN private Rapid Email Verifier container
 * (umutert/emailvalidator, see docker-compose.yml / DEPLOY.md) at
 * EMAIL_CHECK_URL. Signup emails never leave our infrastructure, and there is
 * deliberately NO fallback to the public hosted API.
 *
 *  - EMAIL_CHECK_URL unset or "off" → check skipped (ok: true)
 *  - Fails open: timeout (3s), network error, or an unexpected response →
 *    ok: true plus a warning log (never the address itself)
 *  - Per-domain verdicts are cached in memory for 1 hour
 *
 * Response shape (confirmed against the pinned image):
 *   { email, status: 'VALID' | 'INVALID_FORMAT' | 'INVALID_DOMAIN' |
 *     'NO_MX_RECORDS' | 'DISPOSABLE' | …, typoSuggestion?: 'name@gmail.com',
 *     validations: { syntax, domain_exists, mx_records, is_disposable, … } }
 */

export type EmailCheckReason = 'format' | 'domain' | 'disposable'

export type EmailCheckResult = {
  ok: boolean
  reason?: EmailCheckReason
  suggestion?: string
}

export const EMAIL_CHECK_MESSAGES: Record<EmailCheckReason, string> = {
  format: "That email address doesn't look right.",
  domain: "That email domain can't receive mail. Check for typos.",
  disposable: 'Please use a permanent email address, not a temporary one.',
}

const TIMEOUT_MS = 3000
const CACHE_TTL_MS = 60 * 60 * 1000
const CACHE_MAX_ENTRIES = 5000

/** Domain-level verdict; the suggestion is stored as a domain so it can be
 *  re-applied to any local part. */
type DomainVerdict = { at: number; reason?: Exclude<EmailCheckReason, 'format'>; suggestionDomain?: string }
const domainCache = new Map<string, DomainVerdict>()

function serviceUrl(): string | null {
  const raw = process.env.EMAIL_CHECK_URL?.trim()
  if (!raw || raw.toLowerCase() === 'off') return null
  return raw.replace(/\/+$/, '')
}

/** True when the validator is configured (EMAIL_CHECK_URL set and not "off"). */
export function emailCheckEnabled(): boolean {
  return serviceUrl() !== null
}

// Cheap local shape check so cached domain verdicts can't hide a malformed
// local part. Deliberately permissive: role addresses (info@, admin@) and
// plus/dot aliases are all fine.
const BASIC_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function splitAddress(email: string): { local: string; domain: string } | null {
  const at = email.lastIndexOf('@')
  if (at <= 0 || at === email.length - 1) return null
  return { local: email.slice(0, at), domain: email.slice(at + 1).toLowerCase() }
}

function fromVerdict(local: string, verdict: DomainVerdict): EmailCheckResult {
  const suggestion = verdict.suggestionDomain ? `${local}@${verdict.suggestionDomain}` : undefined
  if (verdict.reason) return { ok: false, reason: verdict.reason, ...(suggestion ? { suggestion } : {}) }
  return { ok: true, ...(suggestion ? { suggestion } : {}) }
}

function remember(domain: string, verdict: DomainVerdict) {
  if (domainCache.size >= CACHE_MAX_ENTRIES) {
    // drop the oldest entry (Map keeps insertion order)
    const oldest = domainCache.keys().next().value
    if (oldest !== undefined) domainCache.delete(oldest)
  }
  domainCache.set(domain, verdict)
}

export async function checkEmail(rawEmail: string): Promise<EmailCheckResult> {
  const base = serviceUrl()
  if (!base) return { ok: true }

  const email = rawEmail.trim()
  const parts = splitAddress(email)
  if (!parts || !BASIC_SHAPE.test(email)) return { ok: false, reason: 'format' }

  const cached = domainCache.get(parts.domain)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return fromVerdict(parts.local, cached)

  let data: unknown
  try {
    const response = await fetch(`${base}/api/validate?email=${encodeURIComponent(email)}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!response.ok) {
      console.warn(`email-check: validator returned HTTP ${response.status}; allowing signup`)
      return { ok: true }
    }
    data = await response.json()
  } catch (error) {
    const reason = error instanceof Error ? error.name : 'unknown error'
    console.warn(`email-check: validator unavailable (${reason}); allowing signup`)
    return { ok: true }
  }

  if (!data || typeof data !== 'object' || typeof (data as { status?: unknown }).status !== 'string') {
    console.warn('email-check: unexpected validator response; allowing signup')
    return { ok: true }
  }

  const { status, typoSuggestion } = data as { status: string; typoSuggestion?: unknown }
  const suggestionParts =
    typeof typoSuggestion === 'string' && typoSuggestion.includes('@') ? splitAddress(typoSuggestion.trim()) : null
  const suggestionDomain =
    suggestionParts && suggestionParts.domain !== parts.domain ? suggestionParts.domain : undefined

  if (status === 'INVALID_FORMAT') {
    // format is about this exact address, not the domain — don't cache
    return {
      ok: false,
      reason: 'format',
      ...(suggestionDomain ? { suggestion: `${parts.local}@${suggestionDomain}` } : {}),
    }
  }

  let reason: DomainVerdict['reason']
  if (status === 'INVALID_DOMAIN' || status === 'NO_MX_RECORDS') reason = 'domain'
  else if (status === 'DISPOSABLE') reason = 'disposable'
  // VALID and any other status → allowed

  const verdict: DomainVerdict = { at: Date.now(), reason, suggestionDomain }
  remember(parts.domain, verdict)
  return fromVerdict(parts.local, verdict)
}

/** Message for a failed check (for API error responses). */
export function emailCheckMessage(result: EmailCheckResult): string | null {
  return !result.ok && result.reason ? EMAIL_CHECK_MESSAGES[result.reason] : null
}
