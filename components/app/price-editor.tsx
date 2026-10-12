'use client'

import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MAX_PRICE_DOLLARS } from '@/lib/money'
import type { ShapedBeat } from '@/lib/beats'

export function PriceEditor({
  beat,
  onClose,
  onSaved,
}: {
  beat: ShapedBeat
  onClose: () => void
  onSaved: () => void
}) {
  const [price, setPrice] = useState(String(beat.price))
  const [exclusive, setExclusive] = useState(
    beat.exclusivePriceCents !== null ? String(beat.exclusivePriceCents / 100) : ''
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const sold = beat.exclusiveSold

  const priceNum = Number(price)
  const priceError = (() => {
    if (!price.trim()) return 'Non-exclusive price is required'
    if (!Number.isFinite(priceNum)) return 'Must be a number'
    if (priceNum === 0) return ''
    if (priceNum < 0.5) return '$0 (free) or at least $0.50'
    if (priceNum > MAX_PRICE_DOLLARS) return `At most $${MAX_PRICE_DOLLARS}`
    return ''
  })()

  const exclusiveError = (() => {
    if (exclusive.trim() === '') return ''
    const value = Number(exclusive)
    if (!Number.isFinite(value)) return 'Must be a number'
    if (value < 0.5) return 'At least $0.50'
    if (value > MAX_PRICE_DOLLARS) return `At most $${MAX_PRICE_DOLLARS}`
    if (priceError === '' && value <= priceNum) return 'Must be greater than the non-exclusive price'
    return ''
  })()

  async function save() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/beats/${beat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          price: priceNum,
          exclusivePrice: exclusive.trim() === '' ? null : Number(exclusive),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not update pricing')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update pricing')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-5">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#151515] p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-lime-300">Set pricing</p>
            <h2 className="mt-1 text-2xl font-black">{beat.title}</h2>
          </div>
          <button onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-4">
          <label className="text-xs font-bold text-muted-foreground">
            Non-exclusive price
            <input
              value={price}
              onChange={e => setPrice(e.target.value.replace(/[^0-9.]/g, ''))}
              className="input mt-2"
              inputMode="decimal"
              placeholder="35"
              disabled={busy}
            />
            <span className="mt-1 block min-h-4 text-xs font-semibold text-red-400">{priceError}</span>
          </label>

          <label className="text-xs font-bold text-muted-foreground">
            Exclusive license price (optional — sells once)
            <input
              value={exclusive}
              onChange={e => setExclusive(e.target.value.replace(/[^0-9.]/g, ''))}
              className="input mt-2 disabled:opacity-50"
              inputMode="decimal"
              placeholder="299"
              disabled={busy || sold}
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              {sold ? 'The exclusive has sold — price can no longer change.' : 'Blank means not offered.'}
            </span>
            <span className="mt-1 block min-h-4 text-xs font-semibold text-red-400">{exclusiveError}</span>
          </label>

          <Button
            onClick={save}
            disabled={busy || !!priceError || !!exclusiveError}
            className="bg-lime-300 font-black text-black disabled:opacity-50"
          >
            {busy ? <Loader2 className="mr-2 animate-spin" size={16} /> : null}
            Save pricing
          </Button>
          {error && <p className="text-sm font-semibold text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  )
}
