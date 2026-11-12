'use client'

import { CircleAlert } from 'lucide-react'
import type { BeatAccess } from '@/lib/studio/types'

export function ExportLockedModal({
  access,
  offerPending,
  beatTitle,
  onClose,
  onBuy,
  onOffer,
}: {
  access: BeatAccess
  offerPending: boolean
  beatTitle: string
  onClose: () => void
  onBuy: () => void
  onOffer: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-5"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#151515] p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-400/15 text-amber-300">
            <CircleAlert size={20} />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-amber-300">
              License required
            </p>
            <h2 className="mt-1 text-xl font-black">Export is locked in Trial mode</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This project uses <b className="text-foreground">“{beatTitle}”</b>, which is still on a
              free trial preview. License the beat to remove the PROD4ME audio tag and export your
              finished song.
            </p>
            {offerPending && (
              <p className="mt-2 rounded-xl bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-200">
                Your offer to the producer is still pending — the project stays in trial mode until
                the license is granted.
              </p>
            )}
            {access !== 'trial' && (
              <p className="mt-2 text-xs text-muted-foreground">
                Files in WAV/MP3 export land here once rendering is wired up — this build doesn’t
                process audio.
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onBuy}
            className="flex-1 rounded-xl bg-lime-300 py-2.5 text-sm font-black text-black hover:bg-lime-200"
          >
            Buy license
          </button>
          <button
            onClick={onOffer}
            className="flex-1 rounded-xl border border-white/15 py-2.5 text-sm font-black hover:bg-white/5"
          >
            Make offer
          </button>
        </div>
        <button
          onClick={onClose}
          className="mt-2 w-full rounded-xl px-4 py-2 text-xs font-bold text-muted-foreground"
        >
          Keep working in Trial mode
        </button>
      </div>
    </div>
  )
}
