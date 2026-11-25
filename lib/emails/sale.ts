import {
  appLinks,
  esc,
  formatDateTime,
  formatAmount,
  licenseLabel,
  preferencesFooterHtml,
  TEST_MODE_NOTICE,
  type EmailBody,
  type LicenseKind,
} from './shared.ts'

/** Sale notification to the producer (respects User.emailSales). */
export function saleNoticeEmail(input: {
  beatTitle: string
  buyerUsername: string
  licenseType: LicenseKind
  amountCents: number
  date: Date
  testMode: boolean
}): EmailBody {
  return {
    subject: `You made a sale — ${input.beatTitle}`,
    heading: 'You made a sale',
    lines: [`@${esc(input.buyerUsername)} licensed <b>${esc(input.beatTitle)}</b>.`],
    rows: [
      ['Beat', input.beatTitle],
      ['Buyer', `@${input.buyerUsername}`],
      ['License', `${licenseLabel(input.licenseType)} license`],
      ['Amount', formatAmount(input.amountCents)],
      ['Date', formatDateTime(input.date)],
    ],
    ...(input.testMode ? { notice: TEST_MODE_NOTICE } : {}),
    ctaLabel: 'Open your dashboard',
    link: appLinks.dashboard(),
    footerHtml: preferencesFooterHtml(),
  }
}
