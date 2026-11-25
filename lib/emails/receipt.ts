import { appLinks, esc, formatDateTime, formatAmount, licenseLabel, TEST_MODE_NOTICE, type EmailBody, type LicenseKind } from './shared.ts'

/**
 * Purchase receipt — the one place its content is defined. Used by the
 * receipt email (lib/emails/send.ts) AND the printable /receipts/[paymentId]
 * page, so both always show the same details.
 */
export type ReceiptDetails = {
  receiptNumber: string // Payment.id
  date: Date
  beatTitle: string
  producerName: string
  licenseType: LicenseKind
  amountCents: number
  fromOffer: boolean
  testMode: boolean
}

export function receiptRows(details: ReceiptDetails): [string, string][] {
  return [
    ['Receipt number', details.receiptNumber],
    ['Date', formatDateTime(details.date)],
    ['Beat', details.beatTitle],
    ['Producer', details.producerName],
    ['License', `${licenseLabel(details.licenseType)} license`],
    ['Amount paid', formatAmount(details.amountCents)],
    ['Purchased through', details.fromOffer ? 'An accepted offer' : 'Direct purchase'],
  ]
}

export function receiptEmail(details: ReceiptDetails): EmailBody {
  return {
    subject: `Your PROD4ME receipt — ${details.beatTitle}`,
    heading: 'Thanks for your purchase',
    lines: [
      `You licensed <b>${esc(details.beatTitle)}</b> by ${esc(details.producerName)}. It’s in your Library now.`,
    ],
    rows: receiptRows(details),
    ...(details.testMode ? { notice: TEST_MODE_NOTICE } : {}),
    ctaLabel: 'View in your Library',
    link: appLinks.library(),
    // receipts are always sent, so no preferences footer — just the printable copy
    footerHtml: `A printable copy of this receipt: <a href="${appLinks.receipt(details.receiptNumber)}" style="color:#000">View receipt</a>.`,
  }
}
