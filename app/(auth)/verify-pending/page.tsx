'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { Loader2, MailWarning, RefreshCw, X } from 'lucide-react'

/**
 * Shown to logged-in users whose email is not verified yet. Polls the
 * verification status every 5s (and on tab focus); when verified, refreshes
 * the session JWT and moves to the feed. A BroadcastChannel lets another tab
 * (the one that opened the emailed link) trigger the redirect immediately.
 */
export default function VerifyPendingPage() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [wrongEmail, setWrongEmail] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [password, setPassword] = useState('')

  const { update: updateSession } = useSession()
  const updateRef = useRef(updateSession)
  updateRef.current = updateSession

  useEffect(() => {
    const session = fetch('/api/auth/session')
      .then(res => res.json())
      .then(data => {
        setEmail(data.user?.email ?? null)
      })
      .catch(() => {})
    void session
  }, [])

  const refresh = useCallback(async () => {
    const res = await fetch('/api/auth/verification-status')
    if (!res.ok) return
    const data = await res.json()
    if (data.verified) {
      // refresh the JWT from the DB, then land on the feed
      await updateRef.current?.({})
      const channel = new BroadcastChannel('prod4me-auth')
      channel.postMessage('verified')
      channel.close()
      router.replace('/')
      router.refresh()
    }
  }, [router])

  useEffect(() => {
    void refresh()
    const interval = setInterval(() => void refresh(), 5000)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    const channel = new BroadcastChannel('prod4me-auth')
    channel.onmessage = () => void refresh()
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      channel.close()
    }
  }, [refresh])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown(c => c - 1), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  const resend = async () => {
    if (cooldown > 0) return
    setResending(true)
    setError('')
    setInfo('')
    try {
      const res = await fetch('/api/auth/resend-verification', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not resend')
      if (data.verified) {
        await refresh()
        return
      }
      setCooldown(60)
      setInfo('Email sent — check your inbox.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend')
    } finally {
      setResending(false)
    }
  }

  const changeEmail = async () => {
    setError('')
    setInfo('')
    try {
      const res = await fetch('/api/account/change-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newEmail, currentPassword: password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not change email')
      setWrongEmail(false)
      setPassword('')
      setEmail(newEmail)
      setInfo('A new link was sent to your new address.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change email')
    }
  }

  return (
    <div className="rounded-3xl border border-border bg-surface p-6">
      <div className="flex items-center justify-between">
        <div className="grid size-12 place-items-center rounded-2xl bg-brand/10 text-brand">
          <MailWarning size={22} />
        </div>
        <button onClick={() => void signOut({ callbackUrl: '/login' })} className="text-xs font-bold text-muted-foreground hover:text-foreground">
          Sign out
        </button>
      </div>

      <h1 className="mt-4 text-2xl font-black">Verify your email</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        We sent a link to <b className="text-foreground">{email ?? 'your email'}</b>. Verify to
        unlock purchasing and the Studio — everything else works without it.
      </p>

      <div className="mt-6 flex items-center gap-2 rounded-2xl border border-border bg-surface-2/50 p-4">
        <Loader2 size={16} className="animate-spin text-brand" />
        <p className="text-xs font-semibold text-muted-foreground">
          Waiting for verification — this page opens the app automatically.
        </p>
      </div>

      {/* Prompt: unverified accounts can browse freely — verification only
          unlocks purchasing and the Studio, so this page is never a trap */}
      <Link
        href="/"
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-black text-foreground hover:bg-surface-2"
      >
        Continue browsing without verifying
      </Link>

      {error && <p className="mt-4 rounded-xl border border-error/30 bg-error/10 p-3 text-xs font-bold text-error">{error}</p>}
      {info && <p className="mt-4 rounded-xl border border-success/30 bg-success/10 p-3 text-xs font-bold text-success">{info}</p>}

      <button
        onClick={() => void resend()}
        disabled={resending || cooldown > 0}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-black text-brand-foreground disabled:opacity-50"
      >
        {resending ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        {cooldown > 0 ? `Resend available in ${cooldown}s` : 'Resend email'}
      </button>

      {!wrongEmail ? (
        <button
          onClick={() => setWrongEmail(true)}
          className="mt-3 w-full text-center text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          Wrong email?
        </button>
      ) : (
        <div className="mt-4 rounded-2xl border border-border bg-surface-2/50 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-muted-foreground">Change email</p>
            <button onClick={() => setWrongEmail(false)} aria-label="Cancel email change">
              <X size={14} />
            </button>
          </div>
          <input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            className="input mt-2"
            placeholder="New email"
            aria-label="New email"
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="input mt-2"
            placeholder="Current password"
            aria-label="Current password"
          />
          <button
            onClick={() => void changeEmail()}
            disabled={!newEmail.includes('@') || !password}
            className="mt-3 w-full rounded-xl bg-brand px-4 py-2.5 text-xs font-black text-brand-foreground disabled:opacity-40"
          >
            Update email and resend link
          </button>
        </div>
      )}
    </div>
  )
}
