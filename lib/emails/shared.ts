import type { EmailContent } from '../email.ts'
import { escapeHtml } from '../email.ts'
import { getAppUrl } from '../app-url.ts'

/** Template output: everything sendEmail() needs except the recipient. */
export type EmailBody = Omit<EmailContent, 'to'>

export type LicenseKind = 'NON_EXCLUSIVE' | 'EXCLUSIVE'

export const TEST_MODE_NOTICE = 'Test mode: no real money was charged.'
/** Offer emails come before any charge, so they use a forward-looking line. */
export const TEST_MODE_OFFER_NOTICE = 'Test mode: payments use Stripe test cards, so no real money is charged.'

export function licenseLabel(type: LicenseKind | string): string {
  return type === 'EXCLUSIVE' ? 'Exclusive' : 'Non-exclusive'
}

/** Receipts and emails always show cents ("$25.00", "$0.00"); the app UI's
 *  formatMoney drops them for whole dollars. */
export function formatAmount(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/** "Nov 25, 2026, 3:04 PM EST" — Eastern Time, like the leaderboard weeks. */
export function formatDateTime(date: Date): string {
  // (dateStyle/timeStyle can't be combined with timeZoneName — spell it out)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  }).format(date)
}

/**
 * In-app destinations for email buttons. `/?open=…` is handled once on load
 * by components/app/app-shell.tsx (logged-out users go through /login first).
 */
export const appLinks = {
  library: () => `${getAppUrl()}/?open=library`,
  dashboard: () => `${getAppUrl()}/?open=dashboard`,
  offers: () => `${getAppUrl()}/?open=offers`,
  beat: (beatId: string) => `${getAppUrl()}/?open=beat&id=${encodeURIComponent(beatId)}`,
  emailSettings: () => `${getAppUrl()}/?open=settings&section=email-notifications`,
  receipt: (paymentId: string) => `${getAppUrl()}/receipts/${encodeURIComponent(paymentId)}`,
}

/** Footer on every non-receipt email (Part C). */
export function preferencesFooterHtml(): string {
  return `You can turn these emails off in <a href="${appLinks.emailSettings()}" style="color:#000">Settings → Email notifications</a>.`
}

/** Escape helper re-exported for templates that build HTML lines. */
export const esc = escapeHtml
