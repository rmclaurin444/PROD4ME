'use client'

import { useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'

export const ARTWORK_PRESETS = [
  { id: 'acid', label: 'Acid', css: 'linear-gradient(135deg,#d6ff4b 0%,#0f5132 100%)' },
  { id: 'ember', label: 'Ember', css: 'linear-gradient(135deg,#ff7f66 0%,#3b0f0d 100%)' },
  { id: 'neon', label: 'Neon', css: 'linear-gradient(135deg,#38e8d0 0%,#0b3f6b 100%)' },
  { id: 'violet', label: 'Violet', css: 'linear-gradient(135deg,#a78bfa 0%,#2e1065 100%)' },
  { id: 'mono', label: 'Mono', css: 'linear-gradient(135deg,#f5f5f5 0%,#111111 100%)' },
  { id: 'sunset', label: 'Sunset', css: 'linear-gradient(135deg,#fbbf24 0%,#7c2d12 100%)' },
]

export function ArtworkSlot({
  file,
  onFile,
  previewUrl,
  onClearFile,
  presetId,
  onPreset,
}: {
  file: File | null
  onFile: (file: File) => void
  previewUrl: string | null
  onClearFile: () => void
  presetId: string | null
  onPreset: (id: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const activePreset = ARTWORK_PRESETS.find(p => p.id === presetId) ?? ARTWORK_PRESETS[0]
  const showUpload = Boolean(previewUrl)

  return (
    <div>
      <p className="mb-2 text-xs font-bold text-muted-foreground">Cover artwork</p>

      <div
        onClick={() => !showUpload && inputRef.current?.click()}
        onDragOver={e => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault()
          setDragging(false)
          const dropped = e.dataTransfer.files?.[0]
          if (dropped) onFile(dropped)
        }}
        className={`relative grid aspect-square w-full place-items-center overflow-hidden rounded-2xl border border-dashed transition ${
          dragging ? 'border-lime-300 bg-lime-300/10' : 'border-white/20 bg-white/[.03]'
        } ${showUpload ? '' : 'cursor-pointer hover:border-white/40'}`}
        style={showUpload ? undefined : { background: activePreset.css }}
      >
        {showUpload ? (
          <>
            {file?.type.startsWith('video') ? (
              <video src={previewUrl!} className="size-full object-cover" muted loop autoPlay />
            ) : (
              <img src={previewUrl!} alt="Artwork preview" className="size-full object-cover" />
            )}
            <button
              onClick={e => {
                e.stopPropagation()
                onClearFile()
              }}
              aria-label="Remove artwork"
              className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-black/70 text-white"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <div className="pointer-events-none text-center">
            <ImagePlus className="mx-auto mb-2 opacity-80" size={22} />
            <p className="text-xs font-bold">Upload image, GIF or video</p>
            <p className="mt-0.5 text-[11px] opacity-70">or pick a preset below</p>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm"
          className="hidden"
          onChange={e => {
            const picked = e.target.files?.[0]
            if (picked) onFile(picked)
          }}
        />
      </div>

      {!showUpload && (
        <div className="mt-3 grid grid-cols-6 gap-2">
          {ARTWORK_PRESETS.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => onPreset(p.id)}
              aria-label={`Use ${p.label} preset`}
              aria-pressed={presetId === p.id}
              title={p.label}
              className={`aspect-square rounded-lg border-2 transition ${
                presetId === p.id ? 'border-lime-300' : 'border-transparent hover:border-white/30'
              }`}
              style={{ background: p.css }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
