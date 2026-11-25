import type { Metadata } from 'next'
import Link from 'next/link'
import { Zap } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Page not found',
}

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 py-12 text-foreground">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-8 grid size-12 place-items-center rounded-xl bg-brand text-brand-foreground">
          <Zap size={24} fill="currentColor" />
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">404</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">This page doesn’t exist</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The link may be broken, or the page may have been removed.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-xl bg-brand px-6 py-3 text-sm font-black text-brand-foreground"
        >
          Back to PROD4ME
        </Link>
      </div>
    </main>
  )
}
