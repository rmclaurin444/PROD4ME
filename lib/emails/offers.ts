import {
  appLinks,
  esc,
  formatDateTime,
  formatAmount,
  licenseLabel,
  preferencesFooterHtml,
  TEST_MODE_OFFER_NOTICE,
  type EmailBody,
  type LicenseKind,
} from './shared.ts'

/** Offer emails (respect User.emailOffers). One template per event. */
export type OfferEmailInput = {
  beatId: string
  beatTitle: string
  licenseType: LicenseKind
  artistUsername: string
  producerName: string
  amountCents: number
  expiresAt: Date | null
  testMode: boolean
}

function common(input: OfferEmailInput) {
  return {
    ...(input.testMode ? { notice: TEST_MODE_OFFER_NOTICE } : {}),
    footerHtml: preferencesFooterHtml(),
  }
}

function expiryRow(input: OfferEmailInput, label = 'Expires'): [string, string][] {
  return input.expiresAt ? [[label, formatDateTime(input.expiresAt)]] : []
}

/** New offer → producer. */
export function newOfferEmail(input: OfferEmailInput): EmailBody {
  return {
    subject: `New offer on ${input.beatTitle}`,
    heading: 'You have a new offer',
    lines: [`@${esc(input.artistUsername)} made an offer on <b>${esc(input.beatTitle)}</b>.`],
    rows: [
      ['Beat', input.beatTitle],
      ['License', `${licenseLabel(input.licenseType)} license`],
      ['Offer', formatAmount(input.amountCents)],
      ['From', `@${input.artistUsername}`],
      ...expiryRow(input),
    ],
    ctaLabel: 'Review the offer',
    link: appLinks.offers(),
    ...common(input),
  }
}

/** Counter → the artist (only producers counter). */
export function offerCounteredEmail(input: OfferEmailInput): EmailBody {
  return {
    subject: `Counteroffer on ${input.beatTitle}`,
    heading: 'You received a counteroffer',
    lines: [`${esc(input.producerName)} countered your offer on <b>${esc(input.beatTitle)}</b>.`],
    rows: [
      ['Beat', input.beatTitle],
      ['License', `${licenseLabel(input.licenseType)} license`],
      ['New amount', formatAmount(input.amountCents)],
      ...expiryRow(input, 'Respond by'),
    ],
    ctaLabel: 'View the offer',
    link: appLinks.offers(),
    ...common(input),
  }
}

/** Producer accepted → artist, pay before the deadline. */
export function offerAcceptedEmail(input: OfferEmailInput): EmailBody {
  return {
    subject: `Offer accepted — pay for ${input.beatTitle}`,
    heading: 'Your offer was accepted',
    lines: [
      `${esc(input.producerName)} accepted your offer on <b>${esc(input.beatTitle)}</b>. Pay before the deadline to get your license.`,
    ],
    rows: [
      ['Beat', input.beatTitle],
      ['License', `${licenseLabel(input.licenseType)} license`],
      ['Amount', formatAmount(input.amountCents)],
      ...expiryRow(input, 'Pay by'),
    ],
    ctaLabel: 'Pay now',
    link: appLinks.offers(),
    ...common(input),
  }
}

/** Declined by the producer, or expired (lazy expiry or cron) → artist. */
export function offerClosedEmail(input: OfferEmailInput, why: 'declined' | 'expired'): EmailBody {
  const declined = why === 'declined'
  return {
    subject: declined ? `Offer declined — ${input.beatTitle}` : `Offer expired — ${input.beatTitle}`,
    heading: declined ? 'Your offer was declined' : 'Your offer expired',
    lines: [
      declined
        ? `${esc(input.producerName)} declined your offer on <b>${esc(input.beatTitle)}</b>. You can still buy it or make a new offer.`
        : `Your offer on <b>${esc(input.beatTitle)}</b> expired before it was completed. You can still buy it or make a new offer.`,
    ],
    rows: [
      ['Beat', input.beatTitle],
      ['License', `${licenseLabel(input.licenseType)} license`],
      ['Amount', formatAmount(input.amountCents)],
    ],
    ctaLabel: 'View the beat',
    link: appLinks.beat(input.beatId),
    ...common(input),
  }
}

/** Exclusive rights sold → artists whose open offers on the beat were closed. */
export function exclusiveSoldEmail(input: OfferEmailInput): EmailBody {
  return {
    subject: `Exclusive sold — ${input.beatTitle}`,
    heading: 'Exclusive rights sold',
    lines: [`This beat's exclusive rights were sold. Your offer was closed.`],
    rows: [
      ['Beat', input.beatTitle],
      ['Your offer', `${formatAmount(input.amountCents)} · ${licenseLabel(input.licenseType)} license`],
    ],
    ctaLabel: 'View the beat',
    link: appLinks.beat(input.beatId),
    ...common(input),
  }
}
