'use client'

import { Circle, Metronome as MetronomeIcon, Play, Repeat, Square, Timer, Pause } from 'lucide-react'
import type { TransportState } from '@/lib/studio/types'
import { TIME_SIGNATURES, formatBarBeat, formatTimecode } from '@/lib/studio/mock-data'

const KEY_OPTIONS = [
  'A minor', 'B minor', 'C minor', 'C major', 'C# minor', 'D minor', 'D major',
  'E minor', 'E major', 'F minor', 'F major', 'F# minor', 'G minor', 'G major', 'A major', 'B major',
]

function TransportButton({
  onClick,
  label,
  active,
  tone = 'default',
  children,
}: {
  onClick: () => void
  label: string
  active?: boolean
  tone?: 'default' | 'red' | 'lime'
  children: React.ReactNode
}) {
  const activeClass =
    tone === 'red'
      ? 'bg-rose-500 text-white'
      : tone === 'lime'
        ? 'bg-lime-300 text-black'
        : 'bg-white/15 text-white'
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`grid size-9 place-items-center rounded-lg border border-white/10 ${
        active ? activeClass : 'bg-white/[.04] text-foreground hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  )
}

export function TransportBar({
  transport,
  playhead,
  bpm,
  musicalKey,
  timeSignature,
  metronome,
  metronomeTick,
  loop,
  onTogglePlay,
  onStop,
  onToggleRecord,
  onToggleLoop,
  onToggleMetronome,
  onSetBpm,
  onSetKey,
  onSetTimeSignature,
}: {
  transport: TransportState
  playhead: number
  bpm: number
  musicalKey: string
  timeSignature: string
  metronome: boolean
  metronomeTick: number
  loop: boolean
  onTogglePlay: () => void
  onStop: () => void
  onToggleRecord: () => void
  onToggleLoop: () => void
  onToggleMetronome: () => void
  onSetBpm: (bpm: number) => void
  onSetKey: (key: string) => void
  onSetTimeSignature: (ts: string) => void
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/10 bg-white/[.02] px-5 py-2.5">
      <div className="flex items-center gap-1.5">
        <TransportButton
          onClick={onTogglePlay}
          label={transport === 'playing' || transport === 'recording' ? 'Pause' : 'Play'}
          active={transport === 'playing' || transport === 'recording'}
          tone="lime"
        >
          {transport === 'playing' || transport === 'recording' ? (
            <Pause size={16} fill="currentColor" />
          ) : (
            <Play size={16} fill="currentColor" />
          )}
        </TransportButton>

        <TransportButton onClick={onStop} label="Stop">
          <Square size={13} fill="currentColor" />
        </TransportButton>

        <TransportButton
          onClick={onToggleRecord}
          label="Record (R)"
          active={transport === 'recording'}
          tone="red"
        >
          <Circle
            size={14}
            fill={transport === 'recording' ? 'currentColor' : 'none'}
            className={transport === 'recording' ? 'animate-pulse' : 'text-rose-400'}
          />
        </TransportButton>
      </div>

      <div className="flex items-center gap-1.5">
        <TransportButton onClick={onToggleLoop} label="Loop" active={loop} tone="lime">
          <Repeat size={15} />
        </TransportButton>
        <div className="relative">
          <TransportButton onClick={onToggleMetronome} label="Metronome" active={metronome} tone="lime">
            <MetronomeIcon size={15} />
          </TransportButton>
          {metronome && (
            <span
              key={metronomeTick}
              className="absolute -right-0.5 -top-0.5 size-2 animate-ping rounded-full bg-lime-300"
            />
          )}
        </div>
      </div>

      <div className="mx-1 h-6 w-px bg-white/10" />

      <label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
        BPM
        <input
          type="number"
          min={40}
          max={300}
          value={bpm}
          onChange={e => onSetBpm(Number(e.target.value))}
          className="w-16 rounded-lg border border-white/10 bg-white/[.04] px-2 py-1.5 text-center text-xs font-black outline-none focus:border-lime-300/60"
        />
      </label>

      <label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
        Key
        <select
          value={musicalKey}
          onChange={e => onSetKey(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/[.04] px-2 py-1.5 text-xs font-black outline-none focus:border-lime-300/60 [&>option]:bg-[#151515]"
        >
          {KEY_OPTIONS.map(k => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
        Time
        <select
          value={timeSignature}
          onChange={e => onSetTimeSignature(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/[.04] px-2 py-1.5 text-xs font-black outline-none focus:border-lime-300/60 [&>option]:bg-[#151515]"
        >
          {TIME_SIGNATURES.map(ts => (
            <option key={ts} value={ts}>
              {ts}
            </option>
          ))}
        </select>
      </label>

      <div className="ml-auto flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-1.5 font-mono text-sm tabular-nums">
        <span className={transport === 'recording' ? 'text-rose-400' : 'text-lime-300'}>
          {formatTimecode(playhead)}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Timer size={12} />
          {formatBarBeat(playhead, bpm, timeSignature)}
        </span>
      </div>
    </div>
  )
}
