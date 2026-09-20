'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError('Invalid email or password')
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
    <div className="rounded-3xl border border-white/10 bg-white/[.03] p-6">
      <h1 className="text-2xl font-black">Welcome back</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Log in to PROD4ME.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <label className="text-xs font-bold text-muted-foreground">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input mt-2"
            placeholder="you@example.com"
            aria-label="Email"
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
          <p className="text-sm font-semibold text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 w-full rounded-xl bg-lime-300 px-4 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? 'Logging in...' : 'Log in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-bold text-lime-300">
          Sign up
        </Link>
      </p>
    </div>
  )
}
