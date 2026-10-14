'use client'

import { useState } from 'react'
import Link from 'next/link'

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const mismatch = confirm.length > 0 && password !== confirm
  const tooShort = password.length > 0 && password.length < 8

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!token) {
      setError('This link is missing its reset token — request a new one.')
      return
    }
    if (tooShort || mismatch) return
    setLoading(true)

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Something went wrong. Please try again.')
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[.03] p-6">
      {done ? (
        <>
          <h1 className="text-2xl font-black">Password updated</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your new password is set. Log in with it now.
          </p>
          <Link
            href="/login"
            className="mt-6 block w-full rounded-xl bg-lime-300 px-4 py-3 text-center text-sm font-black text-black"
          >
            Go to log in
          </Link>
        </>
      ) : !token ? (
        <>
          <h1 className="text-2xl font-black">Reset link invalid</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This link is missing its reset token. Request a new one below.
          </p>
          <Link
            href="/forgot"
            className="mt-6 block w-full rounded-xl bg-lime-300 px-4 py-3 text-center text-sm font-black text-black"
          >
            Request a new link
          </Link>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-black">Choose a new password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick something at least 8 characters long.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            <label className="text-xs font-bold text-muted-foreground">
              New password
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input mt-2"
                placeholder="At least 8 characters"
                aria-label="New password"
                required
              />
            </label>
            {tooShort && <p className="text-xs font-semibold text-red-400">Must be at least 8 characters</p>}

            <label className="text-xs font-bold text-muted-foreground">
              Confirm new password
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="input mt-2"
                placeholder="Repeat it"
                aria-label="Confirm new password"
                required
              />
            </label>
            {mismatch && <p className="text-xs font-semibold text-red-400">Passwords do not match</p>}

            {error && <p className="text-sm font-semibold text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading || tooShort || mismatch}
              className="mt-2 w-full rounded-xl bg-lime-300 px-4 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? 'Updating…' : 'Set new password'}
            </button>
          </form>
        </>
      )}

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Back to{' '}
        <Link href="/login" className="font-bold text-lime-300">
          Log in
        </Link>
      </p>
    </div>
  )
}
