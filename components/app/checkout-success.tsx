'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'

export function CheckoutSuccessView({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState<'pending' | 'succeeded' | 'failed'>('pending')
  const attempts = useRef(0)

  useEffect(() => {
    if (!sessionId) return
    let cancelled = false

    async function poll() {
      try {
        const res = await fetch(`/api/checkout?session_id=${encodeURIComponent(sessionId)}`, {
          cache: 'no-store',
        })
        if (res.ok) {
          const data = await res.json()
          if (data.status === 'SUCCEEDED') {
            if (!cancelled) setStatus('succeeded')
            return
          }
          if (data.status === 'FAILED') {
            if (!cancelled) setStatus('failed')
            return
          }
        }
      } catch {
        // ignore, keep polling
      }
      attempts.current += 1
      if (!cancelled && attempts.current < 30) {
        setTimeout(poll, 2000)
      } else if (!cancelled) {
        setStatus('failed')
      }
    }

    poll()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-5 text-center">
      <div className="w-full rounded-3xl border border-white/10 bg-[#151515] p-8">
        {status === 'pending' && (
          <>
            <Loader2 className="mx-auto animate-spin text-lime-300" size={40} />
            <h1 className="mt-5 text-2xl font-black">Finishing up…</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Waiting for payment confirmation. This only takes a moment.
            </p>
          </>
        )}
        {status === 'succeeded' && (
          <>
            <CheckCircle2 className="mx-auto text-lime-300" size={40} />
            <h1 className="mt-5 text-2xl font-black">Payment complete</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your license is granted and the beat is now in your library.
            </p>
            <a
              href="/"
              className="mt-6 inline-block rounded-xl bg-lime-300 px-5 py-2.5 text-sm font-black text-black"
            >
              Back to the feed
            </a>
          </>
        )}
        {status === 'failed' && (
          <>
            <XCircle className="mx-auto text-red-400" size={40} />
            <h1 className="mt-5 text-2xl font-black">Payment not confirmed yet</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The webhook hasn&apos;t confirmed this payment. If you completed checkout, your license
              will appear shortly — check your offer list.
            </p>
            <a
              href="/"
              className="mt-6 inline-block rounded-xl border border-white/20 px-5 py-2.5 text-sm font-black"
            >
              Back to the feed
            </a>
          </>
        )}
      </div>
    </div>
  )
}
