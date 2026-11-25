'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { timeLeftLabel, formatMoney, dollarsToCents, MIN_PURCHASE_CENTS } from '@/lib/money'
import type { ShapedOffer } from '@/lib/offers'

function licenseLabel(licenseType: string) {
  return licenseType === 'EXCLUSIVE' ? 'Exclusive' : 'Non-exclusive'
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-warning/15 text-warning',
  COUNTERED: 'bg-surface-2 text-foreground',
  AWAITING_PAYMENT: 'bg-brand/15 text-brand',
  PAID: 'bg-success/15 text-success',
  EXPIRED: 'bg-error/15 text-error',
  DECLINED: 'bg-surface-2 text-muted-foreground',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${STATUS_STYLES[status] ?? 'bg-surface-2'}`}>
      {status.replaceAll('_', ' ')}
    </span>
  )
}

export function OffersInbox({ role, isArtist }: { role: string; isArtist: boolean }) {
  const [offers, setOffers] = useState<ShapedOffer[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [counterFor, setCounterFor] = useState<string | null>(null)
  const [counterAmount, setCounterAmount] = useState('')
  const [counterMessage, setCounterMessage] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'waiting' | 'completed' | 'closed'>('waiting')

  const FILTERS = [
    { id: 'waiting', label: 'Waiting' },
    { id: 'completed', label: 'Completed' },
    { id: 'closed', label: 'Closed' },
  ] as const

  const filteredOffers = (offers ?? []).filter(offer => {
    if (filter === 'waiting') {
      return offer.status === 'PENDING' || offer.status === 'COUNTERED' || offer.status === 'AWAITING_PAYMENT'
    }
    if (filter === 'completed') return offer.status === 'PAID'
    return offer.status === 'DECLINED' || offer.status === 'EXPIRED'
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/offers', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not load offers')
      setOffers(data.offers)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load offers')
      setOffers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function act(id: string, action: string, extra: Record<string, unknown> = {}) {
    setBusyId(id)
    setError('')
    try {
      const res = await fetch(`/api/offers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Action failed')
      setOffers(prev => (prev ?? []).map(o => (o.id === id ? { ...o, ...data.offer } : o)))
      setCounterFor(null)
      setCounterAmount('')
      setCounterMessage('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed')
    } finally {
      setBusyId(null)
    }
  }

  async function payNow(offer: ShapedOffer) {
    setBusyId(offer.id)
    setError('')
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId: offer.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not start checkout')
      if (data.url) window.location.assign(data.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout')
      setBusyId(null)
    }
  }

  const counterError = (() => {
    if (!counterAmount.trim()) return ''
    const cents = dollarsToCents(Number(counterAmount))
    if (!Number.isFinite(cents) || cents < MIN_PURCHASE_CENTS) return 'Minimum $0.50'
    return ''
  })()

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex gap-2 rounded-xl bg-surface p-1">
        {FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`flex-1 rounded-lg px-3 py-2 text-xs font-black ${
              filter === f.id ? 'bg-brand text-brand-foreground' : 'text-muted-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && offers === null && (
        <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="animate-spin" size={16} /> Loading offers…
        </p>
      )}

      {offers && filteredOffers.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="font-black">
            {filter === 'waiting'
              ? isArtist
                ? 'No offers yet'
                : 'No incoming offers yet'
              : filter === 'completed'
                ? 'No completed offers yet'
                : 'Nothing closed yet'}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {filter === 'waiting'
              ? isArtist
                ? 'Make offers from the feed to start negotiating.'
                : 'When artists make offers on your beats they show up here.'
              : filter === 'completed'
                ? 'Accepted and paid offers land here.'
                : 'Declined and expired offers land here.'}
          </p>
        </div>
      )}

      {filteredOffers.map(offer => {
        const waiting = offer.status === 'PENDING' || offer.status === 'COUNTERED' || offer.status === 'AWAITING_PAYMENT'
        const expired = offer.status === 'EXPIRED'
        const isProducer = role === 'PRODUCER'

        return (
          <div
            key={offer.id}
            className={`rounded-2xl border p-4 ${
              waiting ? 'border-brand/20 bg-brand/[.05]' : 'border-border bg-surface'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-black">
                  {offer.beat.title}{' '}
                  <span className="ml-1 text-xs font-bold text-muted-foreground">
                    · {licenseLabel(offer.licenseType)}
                  </span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isProducer ? offer.artist.name : offer.producer.name} ·{' '}
                  {new Date(offer.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={offer.status} />
                {waiting && (
                  <span className="text-[11px] font-bold tabular-nums text-muted-foreground">
                    {timeLeftLabel(offer.expiresAt)}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              {offer.status === 'COUNTERED' ? (
                <p className="font-black">
                  Counter: {formatMoney(offer.counterAmountCents ?? 0)}{' '}
                  <span className="text-xs font-normal text-muted-foreground">
                    (your offer {formatMoney(offer.amountCents)})
                  </span>
                </p>
              ) : (
                <p className="font-black">{formatMoney(offer.amountCents)}</p>
              )}
              <span className="text-xs text-muted-foreground">
                listing {formatMoney(offer.listingPriceCents)}
              </span>
            </div>

            {offer.message && (
              <p className="mt-2 rounded-xl bg-surface px-3 py-2 text-sm text-foreground/80">“{offer.message}”</p>
            )}
            {offer.counterMessage && (
              <p className="mt-2 rounded-xl bg-surface-2 px-3 py-2 text-sm text-foreground/90">
                “{offer.counterMessage}”
              </p>
            )}
            {offer.status === 'PAID' && (
              <p className="mt-2 text-xs font-bold text-success">Paid — license granted.</p>
            )}

            {offer.status === 'PENDING' && isProducer && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => act(offer.id, 'accept')}
                  disabled={busyId === offer.id}
                  className="rounded-full bg-brand px-4 py-1.5 text-[10px] font-black text-brand-foreground disabled:opacity-40"
                >
                  ACCEPT
                </button>
                <button
                  onClick={() => {
                    setCounterFor(counterFor === offer.id ? null : offer.id)
                    setCounterAmount('')
                    setCounterMessage('')
                  }}
                  disabled={busyId === offer.id}
                  className="rounded-full border border-border px-4 py-1.5 text-[10px] font-black disabled:opacity-40"
                >
                  COUNTER
                </button>
                <button
                  onClick={() => act(offer.id, 'decline')}
                  disabled={busyId === offer.id}
                  className="rounded-full border border-red-400/40 px-4 py-1.5 text-[10px] font-black text-error disabled:opacity-40"
                >
                  DECLINE
                </button>
              </div>
            )}

            {counterFor === offer.id && isProducer && offer.status === 'PENDING' && (
              <div className="mt-3 rounded-2xl border border-border bg-surface p-3">
                <label className="text-xs font-bold text-muted-foreground">
                  Counter amount
                  <input
                    value={counterAmount}
                    onChange={e => setCounterAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="input mt-2"
                    placeholder={`up to ${formatMoney(offer.listingPriceCents)}`}
                    inputMode="decimal"
                    disabled={busyId === offer.id}
                  />
                </label>
                {counterError ? <p className="mt-1 text-xs font-semibold text-error">{counterError}</p> : null}
                <label className="mt-2 block text-xs font-bold text-muted-foreground">
                  Message (optional)
                  <input
                    value={counterMessage}
                    onChange={e => setCounterMessage(e.target.value)}
                    className="input mt-2"
                    placeholder="Optional note to the artist"
                    disabled={busyId === offer.id}
                  />
                </label>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      act(offer.id, 'counter', {
                        counterAmount: Number(counterAmount),
                        counterMessage: counterMessage.trim() || undefined,
                      })
                    }}
                    disabled={busyId === offer.id || !counterAmount || !!counterError}
                    className="rounded-full bg-brand px-4 py-1.5 text-[10px] font-black text-brand-foreground disabled:opacity-40"
                  >
                    Send counter
                  </button>
                  <button
                    onClick={() => setCounterFor(null)}
                    disabled={busyId === offer.id}
                    className="rounded-full border border-border px-4 py-1.5 text-[10px] font-black disabled:opacity-40"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {offer.status === 'COUNTERED' && isArtist === true && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => act(offer.id, 'accept-counter')}
                  disabled={busyId === offer.id}
                  className="rounded-full bg-brand px-4 py-1.5 text-[10px] font-black text-brand-foreground disabled:opacity-40"
                >
                  ACCEPT COUNTER
                </button>
                <button
                  onClick={() => act(offer.id, 'decline')}
                  disabled={busyId === offer.id}
                  className="rounded-full border border-border px-4 py-1.5 text-[10px] font-black disabled:opacity-40"
                >
                  DECLINE
                </button>
              </div>
            )}

            {offer.status === 'AWAITING_PAYMENT' && isArtist === true && (
              <div className="mt-3">
                <button
                  onClick={() => payNow(offer)}
                  disabled={busyId === offer.id}
                  className="rounded-full bg-brand px-4 py-1.5 text-[10px] font-black text-brand-foreground disabled:opacity-40"
                >
                  {busyId === offer.id ? 'OPENING CHECKOUT…' : 'PAY NOW'}
                </button>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Agreed at {formatMoney(offer.agreedAmountCents ?? offer.amountCents)}
                </p>
              </div>
            )}

            {offer.status === 'COUNTERED' && isProducer === true && (
              <p className="mt-2 text-[11px] text-muted-foreground">Waiting on the artist to respond.</p>
            )}
            {offer.status === 'PENDING' && isArtist === true && (
              <p className="mt-2 text-[11px] text-muted-foreground">Waiting on the producer.</p>
            )}
            {offer.status === 'AWAITING_PAYMENT' && isProducer === true && (
              <p className="mt-2 text-[11px] text-muted-foreground">Waiting for the artist to pay.</p>
            )}
            {expired && <p className="mt-2 text-xs font-bold text-error">No longer active.</p>}
          </div>
        )
      })}

      {error && <p className="text-sm font-semibold text-error">{error}</p>}
    </div>
  )
}
