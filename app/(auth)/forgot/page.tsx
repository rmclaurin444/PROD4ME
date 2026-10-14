'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [devLink, setDevLink] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Please try again.')
      setDone(true)
      setDevLink(data.devLink ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[.03] p-6">
      <h1 className="text-2xl font-black">Forgot password</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Enter the email on your account and we&apos;ll create a reset link.
      </p>

      {done ? (
        <div className="mt-6">
          <p className="text-sm font-semibold text-lime-300">
            If an account with that email exists, a reset link has been created.
          </p>
          {devLink && (
            <div className="mt-4 rounded-2xl border border-lime-300/20 bg-lime-300/[.06] p-4">
              <p className="text-xs font-black uppercase tracking-widest text-lime-300">Dev reset link</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Test mode — no email is sent, use this link:
              </p>
              <Link href={devLink} className="mt-2 block break-all text-xs font-bold text-lime-300">
                {devLink}
              </Link>
            </div>
          )}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Back to{' '}
            <Link href="/login" className="font-bold text-lime-300">
              Log in
            </Link>
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <label className="text-xs font-bold text-muted-foreground">
            Email
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="input mt-2"
              placeholder="you@example.com"
              aria-label="Email"
              required
            />
          </label>

          {error && <p className="text-sm font-semibold text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-xl bg-lime-300 px-4 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? 'Checking…' : 'Create reset link'}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-bold text-lime-300">
          Sign up
        </Link>
      </p>
    </div>
  )
}
