'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Bell, Loader2, Receipt } from 'lucide-react'

/** Same format as the receipt page and emails ("$25.00"). */
const formatAmount = (cents: number) => `$${(cents / 100).toFixed(2)}`

/** Settings → Email notifications (Prompt 15, Part C). */
export function EmailNotificationsSection({
  role,
  emailOffers,
  emailSales,
  onSaved,
}: {
  role: string
  emailOffers: boolean
  emailSales: boolean
  onSaved: (prefs: { emailOffers: boolean; emailSales: boolean }) => void
}) {
  const [busy, setBusy] = useState<'emailOffers' | 'emailSales' | null>(null)
  const [error, setError] = useState('')
  const isProducer = role === 'PRODUCER'

  const save = async (field: 'emailOffers' | 'emailSales', value: boolean) => {
    setBusy(field)
    setError('')
    try {
      const res = await fetch('/api/account/email-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not save')
      onSaved({ emailOffers: data.emailOffers, emailSales: data.emailSales })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section id="email-notifications" className="mt-6 scroll-mt-24 rounded-3xl border border-border bg-surface p-6">
      <div className="flex items-center gap-2">
        <Bell size={16} className="text-brand" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Email notifications</h2>
      </div>

      <div className="mt-4 divide-y divide-border">
        <ToggleRow
          label="Offer updates"
          description={
            isProducer
              ? 'An email when an artist makes an offer on one of your beats.'
              : 'Counteroffers, accepted offers to pay for, and declined, expired or closed offers.'
          }
          checked={emailOffers}
          busy={busy === 'emailOffers'}
          onChange={value => void save('emailOffers', value)}
        />
        {isProducer && (
          <ToggleRow
            label="Sales of my beats"
            description="An email each time someone buys a license to one of your beats."
            checked={emailSales}
            busy={busy === 'emailSales'}
            onChange={value => void save('emailSales', value)}
          />
        )}
        <AlwaysOnRow
          label="Purchase receipts"
          description="Sent for every purchase. They're a record of the transaction."
        />
        <AlwaysOnRow
          label="Free beat confirmations"
          description="Sent when you claim a free beat. They're a record of the claim."
        />
      </div>
      {error && <p className="mt-3 text-xs font-bold text-error">{error}</p>}
    </section>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  busy,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  busy: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-bold">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={busy}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full border border-border transition disabled:opacity-50 ${
          checked ? 'bg-brand' : 'bg-surface-2'
        }`}
      >
        <span
          className={`absolute top-0.5 size-[18px] rounded-full transition-all ${
            checked ? 'left-[22px] bg-brand-foreground' : 'left-0.5 bg-muted-foreground'
          }`}
        />
      </button>
    </div>
  )
}

function AlwaysOnRow({ label, description }: { label: string; description: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-bold">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-black text-muted-foreground">
        Always on
      </span>
    </div>
  )
}

type ListItem = {
  paymentId: string
  date: string
  beatTitle: string
  licenseType: 'NON_EXCLUSIVE' | 'EXCLUSIVE'
  amountCents: number
  buyerUsername?: string
}

function fmtDay(iso: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(iso))
}

/** Settings → Receipts (artists) / Sales (producers) — Part D. */
export function ReceiptsSection() {
  const [state, setState] = useState<{ kind: 'receipts' | 'sales'; items: ListItem[] } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/account/receipts', { cache: 'no-store' })
      .then(async res => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Could not load')
        if (!cancelled) setState({ kind: data.kind, items: data.items ?? [] })
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const isSales = state?.kind === 'sales'

  return (
    <section id="receipts" className="mt-6 scroll-mt-24 rounded-3xl border border-border bg-surface p-6">
      <div className="flex items-center gap-2">
        <Receipt size={16} className="text-brand" />
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
          {isSales ? 'Sales' : 'Receipts'}
        </h2>
      </div>

      {!state && !error && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </p>
      )}
      {error && <p className="mt-4 text-xs font-bold text-error">{error}</p>}
      {state && state.items.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          {isSales ? 'No sales yet.' : 'No purchases yet. Receipts for paid licenses appear here.'}
        </p>
      )}

      {state && state.items.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-widest text-muted-foreground">
                <th className="pb-2 pr-3 font-bold">Date</th>
                <th className="pb-2 pr-3 font-bold">Beat</th>
                {isSales && <th className="pb-2 pr-3 font-bold">Buyer</th>}
                <th className="pb-2 pr-3 font-bold">License</th>
                <th className="pb-2 pr-3 text-right font-bold">Amount</th>
                <th className="pb-2 font-bold">{isSales ? 'Receipt no.' : ''}</th>
              </tr>
            </thead>
            <tbody>
              {state.items.map(item => (
                <tr key={item.paymentId} className="border-t border-border align-top">
                  <td className="whitespace-nowrap py-2.5 pr-3 text-muted-foreground">{fmtDay(item.date)}</td>
                  <td className="py-2.5 pr-3 font-semibold">{item.beatTitle}</td>
                  {isSales && <td className="py-2.5 pr-3">@{item.buyerUsername}</td>}
                  <td className="whitespace-nowrap py-2.5 pr-3">
                    {item.licenseType === 'EXCLUSIVE' ? 'Exclusive' : 'Non-exclusive'}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-right font-bold">{formatAmount(item.amountCents)}</td>
                  <td className="py-2.5">
                    {isSales ? (
                      <span className="font-mono text-[11px] text-muted-foreground">{item.paymentId}</span>
                    ) : (
                      <div className="flex flex-col items-start">
                        <Link
                          href={`/receipts/${item.paymentId}`}
                          target="_blank"
                          className="text-xs font-black underline underline-offset-2"
                        >
                          View
                        </Link>
                        <span className="font-mono text-[10px] text-muted-foreground">{item.paymentId}</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
