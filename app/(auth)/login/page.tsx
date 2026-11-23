'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'

export default function LoginPage() {
  const router = useRouter()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        identifier,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError('Incorrect login or password')
        setLoading(false)
        return
      }

      router.push('/')
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="rounded-3xl border border-border bg-surface p-6">
      <h1 className="text-2xl font-black">Welcome back</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Log in with your email, username, or phone.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <label className="text-xs font-bold text-muted-foreground">
          Email, username, or phone
          <input
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            className="input mt-2"
            placeholder="you@example.com · username · +14045551234"
            aria-label="Email, username, or phone"
            required
          />
        </label>

        <label className="text-xs font-bold text-muted-foreground">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input mt-2"
            placeholder="Your password"
            aria-label="Password"
            required
          />
        </label>

        {error && (
          <p className="text-sm font-semibold text-error">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 w-full rounded-xl bg-brand px-4 py-3 text-sm font-black text-brand-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? 'Logging in...' : 'Log in'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        <Link href="/forgot" className="font-bold text-brand">
          Forgot password?
        </Link>
      </p>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-bold text-brand">
          Sign up
        </Link>
      </p>
    </div>
  )
}

