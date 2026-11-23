'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react'

/**
 * Opened from the verification email link. Confirms the token, then:
 *  - logged in as that user → refresh the session and go to the feed
 *  - not logged in (opened on a phone, etc.) → message + Log in button
 */
export default function VerifyEmailPage() {
  const router = useRouter()
  const { update: updateSession } = useSession()
  const [state, setState] = useState<'working' | 'verified' | 'notLoggedIn' | 'error'>('working')
  const [error, setError] = useState('')
  const [email, setEmail] = useState<string | null>(null)
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true
    const token = new URLSearchParams(window.location.search).get('token') ?? ''

    void (async () => {
      const session = await fetch('/api/auth/session').then(res => res.json())
      const sessionEmail: string | null = session.user?.email ?? null

      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Verification failed')
        setState('error')
        return
      }
      setEmail(data.email)

      if (sessionEmail && sessionEmail.toLowerCase() === String(data.email).toLowerCase()) {
        // this browser is logged in as that user — refresh and land on the feed
        await updateSession({})
        const channel = new BroadcastChannel('prod4me-auth')
        channel.postMessage('verified')
        channel.close()
        setState('verified')
        router.replace('/')
        router.refresh()
        return
      }
      // not logged in as that user (phone, other browser profile, etc.)
      setState('notLoggedIn')
    })()
  }, [router])

  // re-try with a fresh token from the resend flow
  const resendNew = () => {
    router.replace('/verify-pending')
  }

  if (state === 'working') {
    return (
      <div className="rounded-3xl border border-border bg-surface p-6 text-center">
        <Loader2 size={28} className="mx-auto animate-spin text-brand" />
        <h1 className="mt-4 text-2xl font-black">Verifying your email…</h1>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="rounded-3xl border border-border bg-surface p-6 text-center">
        <RefreshCw size={28} className="mx-auto text-error" />
        <h1 className="mt-4 text-2xl font-black">Link expired</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Link
          href="/verify-pending"
          className="mt-6 inline-block rounded-xl bg-brand px-5 py-3 text-sm font-black text-brand-foreground"
        >
          Send a new link
        </Link>
      </div>
    )
  }

  if (state === 'verified') {
    return (
      <div className="rounded-3xl border border-border bg-surface p-6 text-center">
        <CheckCircle2 size={28} className="mx-auto text-success" />
        <h1 className="mt-4 text-2xl font-black">Email verified</h1>
        <p className="mt-2 text-sm text-muted-foreground">Taking you to PROD4ME…</p>
      </div>
    )
  }

  return (
    <div className="rounded-3xl border border-border bg-surface p-6 text-center">
      <CheckCircle2 size={28} className="mx-auto text-success" />
      <h1 className="mt-4 text-2xl font-black">Email verified</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Go back to PROD4ME to continue{email ? ` (${email})` : ''}. The tab that was waiting will open the
        app on its own.
      </p>
      <Link
        href="/login"
        className="mt-6 inline-block rounded-xl bg-brand px-5 py-3 text-sm font-black text-brand-foreground"
      >
        Log in
      </Link>
    </div>
  )
}
