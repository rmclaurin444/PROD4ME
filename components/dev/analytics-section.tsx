'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

type DailyPoint = { date: string; count: number }

type AnalyticsData = {
  range: string
  includeDev: boolean
  users: { total: number; producers: number; artists: number; newInRange: number }
  activeUsers: number
  beats: { total: number; newInRange: number }
  engagement: { streams: number; completions: number; likes: number; comments: number; saves: number; shares: number }
  commerce: { offersMade: number; offerAcceptanceRate: number | null; purchases: number; freeClaims: number; revenueCents: number }
  series: { signups: DailyPoint[]; streams: DailyPoint[]; purchases: DailyPoint[] }
  topBeats: Array<{ id: string; title: string; producer: string; streams: number }>
  topProducers: Array<{ id: string; name: string; streams: number }>
  feedRefreshes: number
  stripeTestMode: boolean
}

const RANGES = ['7d', '30d', 'all'] as const

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
}

function pct(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-2xl font-black tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground/70">{sub}</p>}
    </div>
  )
}

/** Plain CSS bar chart — no chart library. */
function BarChart({ title, points }: { title: string; points: DailyPoint[] }) {
  const max = Math.max(1, ...points.map(p => p.count))
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {points.length === 0 ? (
        <p className="mt-6 text-center text-xs text-muted-foreground/60">No data in range</p>
      ) : (
        <div className="mt-3 flex h-28 items-end gap-1">
          {points.map(point => (
            <div key={point.date} className="group relative flex min-w-[6px] flex-1 items-end">
              <div
                className="w-full rounded-t-sm bg-brand/60 transition group-hover:bg-brand"
                style={{ height: `${Math.max(4, (point.count / max) * 100)}%` }}
              />
              <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 rounded bg-surface-2 px-1 text-[9px] font-black tabular-nums opacity-0 transition group-hover:opacity-100">
                {point.count}
              </span>
            </div>
          ))}
        </div>
      )}
      {points.length > 0 && (
        <div className="mt-1 flex justify-between text-[9px] tabular-nums text-muted-foreground/60">
          <span>{points[0].date.slice(5)}</span>
          <span>{points[points.length - 1].date.slice(5)}</span>
        </div>
      )}
    </div>
  )
}

function TopTable({
  title,
  rows,
}: {
  title: string
  rows: Array<{ key: string; primary: string; secondary: string; value: number }>
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-4 text-center text-xs text-muted-foreground/60">No streams in range</p>
      ) : (
        <ol className="mt-3 space-y-1.5">
          {rows.map((row, index) => (
            <li key={row.key} className="flex items-center gap-2 text-xs">
              <span className="w-4 shrink-0 text-right font-black tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold">{row.primary}</span>
              <span className="hidden min-w-0 max-w-[40%] truncate text-muted-foreground sm:block">
                {row.secondary}
              </span>
              <span className="shrink-0 font-black tabular-nums">{row.value}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export function AnalyticsSection() {
  const [range, setRange] = useState<'7d' | '30d' | 'all'>('7d')
  const [includeDev, setIncludeDev] = useState(false)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/dev/analytics?range=${range}&includeDev=${includeDev ? '1' : '0'}`)
      const body = (await res.json()) as AnalyticsData & { error?: string }
      if (!res.ok) throw new Error(body.error ?? `Analytics failed (${res.status})`)
      setData(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analytics failed')
    } finally {
      setLoading(false)
    }
  }, [range, includeDev])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <section className="mt-8 rounded-2xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-widest text-brand">Analytics</h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
            <input
              type="checkbox"
              checked={includeDev}
              onChange={e => setIncludeDev(e.target.checked)}
              className="accent-brand"
            />
            Include dev data
          </label>
          <div className="flex rounded-lg border border-border bg-surface-2 p-0.5">
            {RANGES.map(value => (
              <button
                key={value}
                onClick={() => setRange(value)}
                aria-pressed={range === value}
                className={`rounded-md px-2.5 py-1 text-[11px] font-black ${
                  range === value ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-error/30 bg-error/10 p-3 text-xs font-bold text-error">
          {error}
        </p>
      )}

      {loading && !data ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          Loading analytics…
        </div>
      ) : data ? (
        <>
          <p className="mt-2 text-[11px] text-muted-foreground">
            {data.includeDev ? 'Including' : 'Excluding'} dev-* seeded accounts · active = any engagement event
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              label="Users"
              value={data.users.total.toLocaleString()}
              sub={`${data.users.producers} producers · ${data.users.artists} artists · +${data.users.newInRange} new`}
            />
            <StatCard label="Active users" value={data.activeUsers.toLocaleString()} sub="engaged in range" />
            <StatCard
              label="Beats"
              value={data.beats.total.toLocaleString()}
              sub={`+${data.beats.newInRange} uploaded`}
            />
            <StatCard label="Streams" value={data.engagement.streams.toLocaleString()} sub="STREAM events" />
            <StatCard
              label="Revenue"
              value={dollars(data.commerce.revenueCents)}
              sub={`${data.commerce.purchases} purchases${data.stripeTestMode ? ' · Stripe test mode' : ''}`}
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Completions" value={data.engagement.completions.toLocaleString()} />
            <StatCard label="Likes" value={data.engagement.likes.toLocaleString()} />
            <StatCard label="Comments" value={data.engagement.comments.toLocaleString()} />
            <StatCard label="Saves" value={data.engagement.saves.toLocaleString()} />
            <StatCard label="Shares" value={data.engagement.shares.toLocaleString()} />
            <StatCard label="Feed refreshes" value={data.feedRefreshes.toLocaleString()} />
            <StatCard
              label="Offers"
              value={data.commerce.offersMade.toLocaleString()}
              sub={`${pct(data.commerce.offerAcceptanceRate)} accepted · ${data.commerce.freeClaims} free claims`}
            />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <BarChart title="Signups / day" points={data.series.signups} />
            <BarChart title="Streams / day" points={data.series.streams} />
            <BarChart title="Purchases / day" points={data.series.purchases} />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <TopTable
              title="Top beats by streams"
              rows={data.topBeats.map(b => ({ key: b.id, primary: b.title, secondary: b.producer, value: b.streams }))}
            />
            <TopTable
              title="Top producers by streams"
              rows={data.topProducers.map(p => ({ key: p.id, primary: p.name, secondary: '', value: p.streams }))}
            />
          </div>
        </>
      ) : null}
    </section>
  )
}
