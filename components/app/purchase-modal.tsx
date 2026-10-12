'use client'

import { useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { dollarsToCents, formatMoney, MIN_PURCHASE_CENTS } from '@/lib/money'
import type { ShapedBeat } from '@/lib/beats'

export type PurchaseMode = 'buy' | 'offer'

type LicenseType = 'NON_EXCLUSIVE' | 'EXCLUSIVE'

const LICENSE_LABEL: Record<LicenseType, string> = {
  NON_EXCLUSIVE: 'Non-exclusive',
  EXCLUSIVE: 'Exclusive',
}

function listingCents(beat: ShapedBeat, licenseType: LicenseType): number | null {
  if (licenseType === 'EXCLUSIVE') return beat.exclusivePriceCents
  return dollarsToCents(beat.price)
}

export function PurchaseModal({
  beat,
  mode: initialMode,
  owned,
  onClose,
  onObtained,
}: {
  beat: ShapedBeat
  mode: PurchaseMode
  owned: LicenseType[]
  onClose: () => void
  onObtained: (licenseType: LicenseType) => void
}) {
  const [mode, setMode] = useState<PurchaseMode>(initialMode)
  const [licenseType, setLicenseType] = useState<LicenseType>('NON_EXCLUSIVE')
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [info, setInfo] = useState('')

  const exclusiveOffered = beat.exclusivePriceCents !== null && !beat.exclusiveSold
  const licenseOwned = owned.includes(licenseType)

  const options = useMemo(() => {
    const opts: LicenseType[] = ['NON_EXCLUSIVE']
    if (exclusiveOffered) opts.push('EXCLUSIVE')
    return opts
  }, [exclusiveOffered])

  const listing = listingCents(beat, licenseType)

  const offerError = useMemo(() => {
    if (!amount.trim()) return ''
    const value = Number(amount)
    if (!Number.isFinite(value)) return 'Must be a number'
    const cents = dollarsToCents(value)
    if (cents < MIN_PURCHASE_CENTS) return 'Minimum $0.50'
    if (listing !== null && cents > listing) {
      return `Cannot exceed the listing price (${formatMoney(listing)})`
    }
    return ''
  }, [amount, listing])

  async function buyNow() {
    setBusy(true)
    setErrorText('')
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beatId: beat.id, licenseType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not start checkout')
      if (data.url) window.location.assign(data.url)
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Could not start checkout')
      setBusy(false)
    }
  }

  async function getFree() {
    setBusy(true)
    setErrorText('')
    try {
      const res = await fetch('/api/licenses/free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beatId: beat.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not claim license')
      setInfo('Added to your library.')
      onObtained('NON_EXCLUSIVE')
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Could not claim license')
    } finally {
      setBusy(false)
    }
  }

  async function sendOffer() {
    if (offerError) return
    setBusy(true)
    setErrorText('')
    try {
      const res = await fetch('/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beatId: beat.id,
          licenseType,
          amount: Number(amount),
          message: message.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not send offer')
      setInfo('Offer sent — the producer has 48h to respond.')
      setMessage('')
      setAmount('')
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Could not send offer')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-5">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#151515] p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-lime-300">Purchase options</p>
            <h2 className="mt-1 text-2xl font-black">{beat.title}</h2>
          </div>
          <button onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>

        {beat.price === 0 && licenseType === 'NON_EXCLUSIVE' ? (
          <div className="mt-6">
            <p className="text-sm font-semibold">This beat is free — claim it and it lands in your library.</p>
            <p className="mt-1 text-sm text-muted-foreground">No payment needed.</p>
            <Button
              onClick={getFree}
              disabled={busy || owned.includes('NON_EXCLUSIVE')}
              className="mt-4 w-full bg-lime-300 font-black text-black disabled:opacity-50"
            >
              {busy ? <Loader2 className="mr-2 animate-spin" size={16} /> : null}
              {owned.includes('NON_EXCLUSIVE') ? 'In your library' : 'Get Free'}
            </Button>
            {exclusiveOffered && (
              <button
                onClick={() => setMode('buy')}
                className="mt-2 w-full rounded-xl px-4 py-2 text-xs font-bold text-muted-foreground"
              >
                Or check out the exclusive license below
              </button>
            )}
          </div>
        ) : null}

        {beat.price > 0 && (
          <>
            <div className="mt-6">
              <p className="mb-2 text-xs font-bold text-muted-foreground">License type</p>
              <div className="flex flex-col gap-2">
                {options
                  .filter(type => !(type === 'NON_EXCLUSIVE' && beat.price === 0) || true)
                  .filter(type => !(type === 'EXCLUSIVE' && !exclusiveOffered))
                  .map(type => {
                    const cents = listingCents(beat, type)
                    const isActive = licenseType === type
                    return (
                      <button
                        key={type}
                        onClick={() => {
                          setLicenseType(type)
                          setErrorText('')
                        }}
                        aria-pressed={isActive}
                        className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                          isActive ? 'border-lime-300/60 bg-lime-300/[.08]' : 'border-white/10 bg-white/[.03]'
                        }`}
                      >
                        <span>
                          <span className="block text-sm font-black">{LICENSE_LABEL[type]}</span>
                          <span className={`text-xs ${owned.includes(type) ? 'text-lime-300' : 'text-muted-foreground'}`}>
                            {owned.includes(type) ? 'In your library' : 'One-time license'}
                          </span>
                        </span>
                        <span className="text-sm font-black">{formatMoney(cents ?? 0)}</span>
                      </button>
                    )
                  })}
              </div>
            </div>

            {mode === 'buy' ? (
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/[.03] p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-lime-300">Confirm purchase</p>
                <div className="mt-3 flex justify-between text-sm">
                  <span className="text-muted-foreground">{LICENSE_LABEL[licenseType]} license</span>
                  <span className="font-black">{listing !== null ? formatMoney(listing) : '—'}</span>
                </div>
                <Button
                  onClick={buyNow}
                  disabled={busy || listing === null || licenseOwned}
                  className="mt-4 w-full bg-lime-300 font-black text-black disabled:opacity-50"
                >
                  {busy ? (
                    <>
                      <Loader2 className="mr-2 animate-spin" size={16} /> Opening checkout…
                    </>
                  ) : licenseOwned ? (
                    'Already licensed'
                  ) : (
                    'Pay with card'
                  )}
                </Button>
                <button
                  onClick={() => setMode('offer')}
                  disabled={busy}
                  className="mt-2 w-full rounded-xl px-4 py-2 text-xs font-bold text-muted-foreground disabled:opacity-50"
                >
                  Make an offer instead
                </button>
              </div>
            ) : (
              <div className="mt-5 flex flex-col gap-2">
                <label className="text-xs font-bold text-muted-foreground">
                  Your offer ({LICENSE_LABEL[licenseType].toLowerCase()})
                  <input
                    value={amount}
                    onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    className="input mt-2"
                    placeholder={listing !== null ? `up to ${(listing / 100).toFixed(2)}` : '0.00'}
                    inputMode="decimal"
                    disabled={busy}
                  />
                </label>
                {offerError ? <p className="text-xs font-semibold text-red-400">{offerError}</p> : null}
                <label className="text-xs font-bold text-muted-foreground">
                  Message to the producer (optional)
                  <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    className="input mt-2 min-h-20 resize-y"
                    placeholder="Why should they accept?"
                    disabled={busy}
                  />
                </label>
                <Button
                  onClick={sendOffer}
                  disabled={busy || !amount || !!offerError}
                  className="bg-lime-300 font-black text-black disabled:opacity-50"
                >
                  {busy ? (
                    <>
                      <Loader2 className="mr-2 animate-spin" size={16} /> Sending…
                    </>
                  ) : (
                    'Send offer'
                  )}
                </Button>
                <button
                  onClick={() => setMode('buy')}
                  disabled={busy}
                  className="w-full rounded-xl px-4 py-2 text-xs font-bold text-muted-foreground disabled:opacity-50"
                >
                  Buy at listing price instead
                </button>
              </div>
            )}
          </>
        )}

        {errorText ? <p className="mt-4 text-sm font-semibold text-red-400">{errorText}</p> : null}
        {info ? <p className="mt-4 text-sm font-semibold text-lime-300">{info}</p> : null}
      </div>
    </div>
  )
}
