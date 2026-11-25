import { appLinks, esc, formatDateTime, formatAmount, licenseLabel, type EmailBody, type LicenseKind } from './shared.ts'

/** Free beat claimed — confirmation to the artist (always sent; a record of the claim). */
export function freeClaimEmail(input: {
  beatTitle: string
  producerName: string
  licenseType: LicenseKind
  date: Date
}): EmailBody {
  return {
    subject: `Added to your Library — ${input.beatTitle}`,
    heading: 'Free beat claimed',
    lines: [`<b>${esc(input.beatTitle)}</b> by ${esc(input.producerName)} is in your Library now.`],
    rows: [
      ['Beat', input.beatTitle],
      ['Producer', input.producerName],
      ['License', `${licenseLabel(input.licenseType)} license`],
      ['Amount', formatAmount(0)],
      ['Date', formatDateTime(input.date)],
    ],
    ctaLabel: 'View in your Library',
    link: appLinks.library(),
  }
}
