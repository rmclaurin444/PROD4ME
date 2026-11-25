import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Zap } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getReceiptForBuyer } from '@/lib/receipts'
import { receiptRows } from '@/lib/emails/receipt'
import { TEST_MODE_NOTICE } from '@/lib/emails/shared'
import { PrintButton } from '@/components/app/print-button'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Receipt',
  robots: { index: false, follow: false },
}

/**
 * Printable purchase receipt. Only the buyer can open it (anyone else gets a
 * 404, so receipt numbers can't be probed). Same details as the receipt email
 * (both come from receiptRows in lib/emails/receipt.ts).
 */
export default async function ReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { paymentId } = await params
  const receipt = await getReceiptForBuyer(paymentId, session.user.id)
  if (!receipt) notFound()

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground print:p-0">
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href="/" className="text-sm font-bold text-muted-foreground hover:text-foreground">
            ← Back to PROD4ME
          </Link>
          <PrintButton />
        </div>

        <article className="rounded-3xl border border-border bg-surface p-8 print:rounded-none print:border-0 print:p-0">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-md bg-brand text-brand-foreground">
              <Zap size={18} fill="currentColor" />
            </span>
            <span className="text-xl font-black tracking-tighter">
              PROD<span className="text-brand">4</span>ME
            </span>
          </div>

          <h1 className="mt-8 text-2xl font-black">Receipt</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            License purchase for <b className="text-foreground">{receipt.beatTitle}</b>
          </p>

          <table className="mt-6 w-full border-collapse text-sm">
            <tbody>
              {receiptRows(receipt).map(([label, value]) => (
                <tr key={label} className="border-t border-border">
                  <th scope="row" className="py-3 pr-4 text-left align-top font-semibold text-muted-foreground">
                    {label}
                  </th>
                  <td className="break-all py-3 text-right align-top font-bold">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {receipt.testMode && (
            <p className="mt-6 rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold">
              {TEST_MODE_NOTICE}
            </p>
          )}

          <p className="mt-8 text-xs text-muted-foreground">
            Payments are processed by Stripe. Keep this receipt for your records.
          </p>
        </article>
      </div>
    </main>
  )
}
