'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import Cropper, { type Area } from 'react-easy-crop'

export type CropShape = 'circle' | 'rect'

/**
 * Image crop dialog built on react-easy-crop.
 *  - avatar: 1:1 circular crop, zoom + drag
 *  - banner: fixed 3:1 crop, zoom + drag, exported at 1500×500
 * Exports the cropped image to a canvas and hands back the cropped file
 * (never the original).
 */
export function CropDialog({
  file,
  shape,
  title,
  onCancel,
  onDone,
}: {
  file: File
  shape: CropShape
  title: string
  onCancel: () => void
  onDone: (file: File) => void
}) {
  const [imageUrl] = useState(() => URL.createObjectURL(file))
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedArea, setCroppedArea] = useState<Area | null>(null)
  const [working, setWorking] = useState(false)
  const [blurry, setBlurry] = useState(false)

  const aspect = shape === 'circle' ? 1 : 3

  const onCropComplete = (_: Area, area: Area) => {
    setCroppedArea(area)
    // blur warning (non-blocking): 400×400 avatar / 1200×400 banner minimums
    void (async () => {
      try {
        const bitmap = await createImageBitmap(file)
        const minSide = shape === 'circle' ? 400 : 1200
        setBlurry(Math.min(bitmap.width, bitmap.height * aspect) < minSide)
      } catch {
        // ignore — the warning is cosmetic
      }
    })()
  }

  const exportCrop = async () => {
    if (!croppedArea) return
    setWorking(true)
    try {
      const bitmap = await createImageBitmap(file)
      const outW = shape === 'circle' ? 800 : 1500
      const outH = shape === 'circle' ? 800 : 500
      const canvas = document.createElement('canvas')
      canvas.width = outW
      canvas.height = outH
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(
        bitmap,
        croppedArea.x,
        croppedArea.y,
        croppedArea.width,
        croppedArea.height,
        0,
        0,
        outW,
        outH
      )
      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, 'image/webp', 0.9)
      )
      if (!blob) throw new Error('Could not export the image')
      const cropped = new File([blob], `${shape}-crop.webp`, { type: 'image/webp' })
      onDone(cropped)
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-scrim p-5">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-surface p-6">
        <h2 className="text-xl font-black">{title}</h2>

        <div className="relative mt-4 h-72 w-full overflow-hidden rounded-2xl bg-black">
          <Cropper
            image={imageUrl}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            cropShape={shape === 'circle' ? 'round' : 'rect'}
            showGrid={shape === 'rect'}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            restrictPosition
          />
        </div>

        {blurry && (
          <p className="mt-3 text-xs font-semibold text-warning">This image may look blurry.</p>
        )}

        <label className="mt-4 block text-xs font-bold text-muted-foreground">
          Zoom
          <input
            aria-label="Zoom"
            type="range"
            min={1}
            max={4}
            step={0.05}
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            className="mt-2 w-full accent-brand"
          />
        </label>

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => void exportCrop()}
            disabled={working}
            className="flex-1 rounded-xl bg-brand px-4 py-2.5 text-sm font-black text-brand-foreground disabled:opacity-40"
          >
            {working ? <Loader2 size={16} className="mx-auto animate-spin" /> : 'Use this crop'}
          </button>
          <button
            onClick={onCancel}
            className="rounded-xl border border-border px-4 py-2.5 text-sm font-black"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
