'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function UploadView() {
  const [uploadPrice, setUploadPrice] = useState(35)

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-5 pb-28 pt-24 md:px-12">
      <p className="text-xs font-bold uppercase tracking-widest text-lime-300">Creator studio</p>
      <h1 className="mt-2 text-4xl font-black">Upload a new beat</h1>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-dashed border-white/20 bg-white/[.03] p-12 text-center">
          <Plus className="mx-auto mb-3 text-lime-300" />
          <p className="font-bold">Drop your audio here</p>
          <p className="mt-1 text-xs text-muted-foreground">MP3, WAV or AIFF · Max 250MB</p>
        </div>

        <div className="flex flex-col gap-4">
          <label className="text-xs font-bold text-muted-foreground">
            Beat title
            <input className="input mt-2" placeholder="e.g. Late Checkout" />
          </label>

          <label className="text-xs font-bold text-muted-foreground">
            Tags
            <input className="input mt-2" placeholder="Add tags with Enter or comma" />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="text-xs font-bold text-muted-foreground">
              BPM
              <input className="input mt-2" placeholder="76" />
            </label>
            <label className="text-xs font-bold text-muted-foreground">
              Key
              <input className="input mt-2" placeholder="F# minor" />
            </label>
            <label className="col-span-1 text-xs font-bold text-muted-foreground">
              Price{' '}
              <span className="ml-2 rounded-full bg-lime-300 px-2 py-1 text-[10px] text-black">
                {uploadPrice === 0 ? 'FREE' : `$${uploadPrice}`}
              </span>
              <input
                aria-label="Beat price"
                type="range"
                min="0"
                max="600"
                step="5"
                value={uploadPrice}
                onChange={e => setUploadPrice(Number(e.target.value))}
                className="mt-4 w-full accent-lime-300"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                {uploadPrice === 0 ? '$0 — Free' : `$${uploadPrice}`}
              </span>
            </label>
          </div>

          <div className="rounded-xl border border-dashed border-white/20 p-4 text-center text-xs font-bold text-muted-foreground">
            Cover Artwork · Upload image
          </div>

          <Button className="bg-lime-300 font-black text-black">Publish beat</Button>
        </div>
      </div>
    </div>
  )
}
