'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BarChart3, Check, Copy, Loader2, RefreshCcw, Trophy, X } from 'lucide-react'
import { formatCount } from '@/components/app/data'

type DailyPoint = { date: string; count: number }

type InsightsData = {
  range: string
  totals: {
    streams: number
    likes: number
    comments: number
    saves: number
    shares: number
    completionRate: number | null
    skips: number
    offersReceived: number
    licensesSold: number
    revenueCents: number
    revenueLabel: string
  }
  dailyStreams: DailyPoint[]
  bestRank: number | null
}

const RANGES = ['7d', '30d', 'all'] as const

function pct(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`
}

function StatCard({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <p className="text-lg font-black tabular-nums">
        {loading ? <Loader2 size={14} className="animate-spin text-muted-foreground" /> : value}
      </p>
      <p className="mt-0.5 text-[10px] font-bold text-muted-foreground">{label}</p>
    </div>
  )
}

/** Plain CSS bar chart — no chart library. */
function StreamsChart({ points, loading }: { points: DailyPoint[]; loading: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <BarChart3 size={12} /> Daily streams
      </p>
      {loading ? (
        <div className="mt-4 flex justify-center py-6">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      ) : points.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground/60">No streams in range</p>
      ) : (
        <>
          <div className="mt-3 flex h-20 items-end gap-1">
            {points.map(point => {
              const max = Math.max(1, ...points.map(p => p.count))
              return (
                <div key={point.date} className="group relative flex min-w-[6px] flex-1 items-end">
                  <div
                    className="w-full rounded-t-sm bg-brand/60 transition group-hover:bg-brand"
                    style={{ height: `${Math.max(4, (point.count / max) * 100)}%` }}
                  />
                  <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 rounded bg-surface-2 px-1 text-[9px] font-black tabular-nums opacity-0 transition group-hover:opacity-100">
                    {point.count}
                  </span>
                </div>
              )
            })}
          </div>
          <div className="mt-1 flex justify-between text-[9px] tabular-nums text-muted-foreground/60">
            <span>{points[0]!.date.slice(5)}</span>
            <span>{points[points.length - 1]!.date.slice(5)}</span>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Owner-only insights for the beat in the preview overlay: a right-side
 * panel on desktop; a swipe-down bottom sheet on mobile. Loads per
 * (beatId, range) with per-card loading states and a retry on failure.
 */
export function InsightsPanel({
  beatId,
  beatTitle,
  open,
  onClose,
  onEditPrice,
}: {
  beatId: string
  beatTitle: string
  /** mobile bottom sheet visibility (desktop is always visible) */
  open: boolean
  onClose: () => void
  onEditPrice: () => void
}) {
  const [range, setRange] = useState<(typeof RANGES)[number]>('7d')
  const [data, setData] = useState<InsightsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const dragStartY = useRef<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/beats/${beatId}/insights?range=${range}`, { cache: 'no-store' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Could not load insights')
      setData(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load insights')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [beatId, range])

  // reload when the panel opens, the beat changes, or the range moves
  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const shareLink = () => {
    const url = `${window.location.origin}/?beat=${encodeURIComponent(beatTitle)}`
    void navigator.clipboard.writeText(url).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      },
      () => {}
    )
  }

  // mobile sheet: swipe down to dismiss
  const onTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0]?.clientY ?? null
  }
  const onTouchMove = (e: React.TouchEvent) => {
    const startY = dragStartY.current
    if (startY === null) return
    const delta = (e.touches[0]?.clientY ?? 0) - startY
    if (delta > 80) {
      dragStartY.current = null
      onClose()
    }
  }
  const onTouchEnd = () => {
    dragStartY.current = null
  }

  const totals = data?.totals
  const loadingCards = loading || !data

  return (
    <aside
      aria-label={`Insights for ${beatTitle}`}
      className={`insights-panel z-20 flex flex-col gap-3 overflow-y-auto border-border bg-background p-4 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[70vh] max-md:rounded-t-3xl max-md:border-t max-md:shadow-2xl max-md:transition-transform max-md:duration-300 ${
        open ? 'max-md:translate-y-0' : 'max-md:translate-y-full'
      } md:h-full md:w-80 md:shrink-0 md:border-l`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* drag handle (mobile sheet) + close */}
      <div className="flex items-center justify-between md:hidden">
        <span className="mx-auto h-1.5 w-12 rounded-full bg-surface-2" aria-hidden />
        <button
          onClick={onClose}
          aria-label="Close insights"
          className="absolute right-3 top-3 grid size-8 place-items-center rounded-full hover:bg-surface-2"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Insights</h2>
        <div className="flex rounded-lg border border-border bg-surface p-0.5">
          {RANGES.map(value => (
            <button
              key={value}
              onClick={() => setRange(value)}
              aria-pressed={range === value}
              className={`rounded-md px-2 py-1 text-[10px] font-black ${
                range === value ? 'bg-brand text-brand-foreground' : 'text-muted-foreground'
              }`}
            >
              {value === 'all' ? 'All' : value === '7d' ? '7d' : '30d'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-error/30 bg-error/10 p-3 text-center">
          <p className="text-xs font-bold text-error">{error}</p>
          <button
            onClick={() => void load()}
            className="mx-auto mt-2 flex items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-1.5 text-[10px] font-black"
          >
            <RefreshCcw size={11} /> Try again
          </button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Streams" value={totals ? totals.streams.toLocaleString() : ''} loading={loadingCards} />
        <StatCard label="Completion" value={totals ? pct(totals.completionRate) : ''} loading={loadingCards} />
        <StatCard label="Skips" value={totals ? totals.skips.toLocaleString() : ''} loading={loadingCards} />
        <StatCard label="Likes" value={totals ? totals.likes.toLocaleString() : ''} loading={loadingCards} />
        <StatCard label="Comments" value={totals ? totals.comments.toLocaleString() : ''} loading={loadingCards} />
        <StatCard label="Saves" value={totals ? totals.saves.toLocaleString() : ''} loading={loadingCards} />
        <StatCard label="Shares" value={totals ? totals.shares.toLocaleString() : ''} loading={loadingCards} />
        <StatCard label="Offers" value={totals ? totals.offersReceived.toLocaleString() : ''} loading={loadingCards} />
        <StatCard label="Licenses" value={totals ? totals.licensesSold.toLocaleString() : ''} loading={loadingCards} />
      </div>

      <StreamsChart points={data?.dailyStreams ?? []} loading={loadingCards} />

      <div className="rounded-2xl border border-border bg-surface p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Revenue</p>
        <p className="mt-1 text-xl font-black tabular-nums">
          {loadingCards ? <Loader2 size={14} className="animate-spin text-muted-foreground" /> : totals?.revenueLabel}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-3">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          <Trophy size={12} /> Best weekly rank
        </p>
        <p className="mt-1 text-lg font-black">
          {loadingCards ? (
            <Loader2 size={14} className="animate-spin text-muted-foreground" />
          ) : data?.bestRank ? (
            `#${data.bestRank}`
          ) : (
            <span className="text-sm font-bold text-muted-foreground">Not charted yet</span>
          )}
        </p>
      </div>

      {/* actions */}
      <div className="mt-auto flex gap-2 pt-2">
        <button
          onClick={onEditPrice}
          className="flex-1 rounded-xl bg-brand py-2.5 text-[10px] font-black text-brand-foreground"
        >
          EDIT PRICE
        </button>
        <button
          onClick={shareLink}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-[10px] font-black"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'COPIED' : 'SHARE LINK'}
        </button>
      </div>
    </aside>
  )
}
