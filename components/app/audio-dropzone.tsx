'use client'

import { useRef, useState } from 'react'
import { AudioLines, X } from 'lucide-react'

export function AudioDropzone({
  file,
  onFile,
  onClear,
  durationSec,
  disabled,
}: {
  file: File | null
  onFile: (file: File) => void
  onClear: () => void
  durationSec: number | null
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${Math.round(bytes / 1024)} KB`
  }

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  if (file) {
    return (
      <div className="rounded-2xl border border-white/20 bg-white/[.03] p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-lime-300 text-black">
            <AudioLines size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{file.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatSize(file.size)}
              {durationSec ? ` · ${formatDuration(durationSec)}` : ''}
            </p>
          </div>
          {!disabled && (
            <button
              onClick={onClear}
              aria-label="Remove audio file"
              className="grid size-7 place-items-center rounded-full bg-white/10"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={e => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault()
        setDragging(false)
        const dropped = e.dataTransfer.files?.[0]
        if (dropped && !disabled) onFile(dropped)
      }}
      className={`grid aspect-video w-full place-items-center rounded-2xl border border-dashed transition ${
        dragging ? 'border-lime-300 bg-lime-300/10' : 'border-white/20 bg-white/[.03]'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-white/40'}`}
    >
      <div className="pointer-events-none text-center">
        <AudioLines className="mx-auto mb-3 text-lime-300" size={26} />
        <p className="text-sm font-bold">Drop your audio here</p>
        <p className="mt-1 text-xs text-muted-foreground">MP3, WAV or AIFF · Max 250MB</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/aiff,audio/x-aiff,audio/flac"
        className="hidden"
        onChange={e => {
          const picked = e.target.files?.[0]
          if (picked) onFile(picked)
        }}
      />
    </div>
  )
}
