'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'
import Link from 'next/link'
import { Zap } from 'lucide-react'

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 py-12 text-foreground">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-8 grid size-12 place-items-center rounded-xl bg-brand text-brand-foreground">
          <Zap size={24} fill="currentColor" />
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Error</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Something went wrong</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          An unexpected error happened. Try again, and if it keeps happening, come back in a few minutes.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">Reference: {error.digest}</p>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => retry()}
            className="rounded-xl bg-brand px-6 py-3 text-sm font-black text-brand-foreground"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-xl border border-border bg-surface px-6 py-3 text-sm font-black"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  )
}
