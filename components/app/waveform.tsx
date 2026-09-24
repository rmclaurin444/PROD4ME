'use client'

import { useRef } from 'react'

const BAR_COUNT = 128

export function Waveform({
  peaks,
  progress,
  currentTime,
  duration,
  onSeek,
  disabled,
}: {
  peaks: number[] | null
  progress: number
  currentTime: number
  duration: number
  onSeek: (fraction: number) => void
  disabled?: boolean
}) {
  const railRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const values =
    peaks && peaks.length > 0 ? peaks : Array(BAR_COUNT).fill(0.12)

  const fmt = (s: number) => {
    if (!Number.isFinite(s) || s < 0) s = 0
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  const fractionFromEvent = (e: React.PointerEvent) => {
    const el = railRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return 0
    const x = e.clientX - rect.left
    return Math.min(1, Math.max(0, x / rect.width))
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return
    dragging.current = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    onSeek(fractionFromEvent(e))
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || disabled) return
    onSeek(fractionFromEvent(e))
  }

  const stopDrag = () => {
    dragging.current = false
  }

  return (
    <div className="mt-4 flex items-center gap-3">
      <span className="shrink-0 text-[11px] font-bold tabular-nums text-white/60">
        {fmt(currentTime)}
      </span>

      <div
        ref={railRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        role="slider"
        aria-label="Seek within beat"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className={`relative flex h-10 min-w-0 flex-1 items-center gap-[2px] ${
          disabled ? '' : 'cursor-pointer touch-none'
        }`}
      >
        {values.map((v, i) => {
          const played = i / values.length < progress
          return (
            <span
              key={i}
              className={`min-w-[2px] flex-1 rounded-full ${
                played ? 'bg-lime-300' : 'bg-white/25'
              } ${disabled ? 'opacity-40' : ''}`}
              style={{ height: `${Math.max(8, v * 100)}%` }}
            />
          )
        })}
      </div>

      <span className="shrink-0 text-[11px] font-bold tabular-nums text-white/60">
        {fmt(duration)}
      </span>
    </div>
  )
}
