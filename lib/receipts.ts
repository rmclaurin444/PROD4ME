import { prisma } from './prisma.ts'
import { receiptDetailsFromPayment } from './emails/send.ts'
import type { ReceiptDetails } from './emails/receipt.ts'

/**
 * Receipts (artist purchases) and sales (producer side) for Settings and the
 * printable /receipts/[paymentId] page. Only SUCCEEDED payments count.
 */

const receiptInclude = {
  beat: { select: { title: true, producer: { select: { name: true } } } },
} as const

/** The buyer's receipt, or null if it doesn't exist / isn't theirs. */
export async function getReceiptForBuyer(paymentId: string, userId: string): Promise<ReceiptDetails | null> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: receiptInclude })
  if (!payment || payment.artistId !== userId || payment.status !== 'SUCCEEDED') return null
  return receiptDetailsFromPayment(payment)
}

export type ReceiptListItem = {
  paymentId: string
  date: string
  beatTitle: string
  licenseType: 'NON_EXCLUSIVE' | 'EXCLUSIVE'
  amountCents: number
}

export type SaleListItem = ReceiptListItem & { buyerUsername: string }

const LIST_LIMIT = 100

export async function listReceipts(artistId: string): Promise<ReceiptListItem[]> {
  const payments = await prisma.payment.findMany({
    where: { artistId, status: 'SUCCEEDED' },
    orderBy: { createdAt: 'desc' },
    take: LIST_LIMIT,
    select: { id: true, createdAt: true, licenseType: true, amountCents: true, beat: { select: { title: true } } },
  })
  return payments.map(payment => ({
    paymentId: payment.id,
    date: payment.createdAt.toISOString(),
    beatTitle: payment.beat.title,
    licenseType: payment.licenseType,
    amountCents: payment.amountCents,
  }))
}

export async function listSales(producerId: string): Promise<SaleListItem[]> {
  const payments = await prisma.payment.findMany({
    where: { status: 'SUCCEEDED', beat: { producerId } },
    orderBy: { createdAt: 'desc' },
    take: LIST_LIMIT,
    select: {
      id: true,
      createdAt: true,
      licenseType: true,
      amountCents: true,
      beat: { select: { title: true } },
      artist: { select: { username: true } },
    },
  })
  return payments.map(payment => ({
    paymentId: payment.id,
    date: payment.createdAt.toISOString(),
    beatTitle: payment.beat.title,
    licenseType: payment.licenseType,
    amountCents: payment.amountCents,
    buyerUsername: payment.artist.username,
  }))
}
