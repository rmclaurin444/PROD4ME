'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { ChevronLeft, Mic2, AudioLines, Check } from 'lucide-react'

type Step = 'details' | 'role'
type Role = 'PRODUCER' | 'ARTIST'

export default function SignUpPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('details')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [role, setRole] = useState<Role | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const validateDetails = () => {
    if (!name.trim()) return 'Name is required'
    if (!email.includes('@')) return 'Please enter a valid email'
    if (password.length < 8) return 'Password must be at least 8 characters'
    if (password !== confirmPassword) return 'Passwords do not match'
    return ''
  }

  const handleContinue = () => {
    const validationError = validateDetails()
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    setStep('role')
  }

  const handleSubmit = async () => {
    if (!role) {
      setError('Please select a role to continue')
      return
    }

    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Registration failed')
        setLoading(false)
        return
      }

      const signInResult = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (signInResult?.error) {
        setError('Account created but sign in failed. Please log in.')
        setLoading(false)
        router.push('/login')
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
      {step === 'details' ? (
        <>
          <h1 className="text-2xl font-black">Create your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Step 1 of 2 — Your details
          </p>

          <div className="mt-6 flex flex-col gap-4">
            <label className="text-xs font-bold text-muted-foreground">
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input mt-2"
                placeholder="Your name"
                aria-label="Name"
              />
            </label>

            <label className="text-xs font-bold text-muted-foreground">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input mt-2"
                placeholder="you@example.com"
                aria-label="Email"
              />
            </label>

            <label className="text-xs font-bold text-muted-foreground">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input mt-2"
                placeholder="At least 8 characters"
                aria-label="Password"
              />
            </label>

            <label className="text-xs font-bold text-muted-foreground">
              Confirm password
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input mt-2"
                placeholder="Re-enter your password"
                aria-label="Confirm password"
              />
            </label>
          </div>

          {error && (
            <p className="mt-4 text-sm font-semibold text-red-400">{error}</p>
          )}

          <button
            onClick={handleContinue}
            className="mt-6 w-full rounded-xl bg-lime-300 px-4 py-3 text-sm font-black text-black"
          >
            Continue
          </button>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="font-bold text-lime-300">
              Log in
            </Link>
          </p>
        </>
      ) : (
        <>
          <button
            onClick={() => {
              setStep('details')
              setError('')
            }}
            className="mb-4 flex items-center gap-2 text-sm font-bold text-muted-foreground"
          >
            <ChevronLeft size={18} /> Back
          </button>

          <h1 className="text-2xl font-black">Choose your role</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Step 2 of 2 — This decides your tools. It can&apos;t be changed
            later.
          </p>

          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={() => setRole('PRODUCER')}
              className={`flex items-start gap-4 rounded-2xl border p-4 text-left transition ${
                role === 'PRODUCER'
                  ? 'border-lime-300 bg-lime-300/10'
                  : 'border-white/10 bg-white/[.03] hover:border-white/20'
              }`}
              aria-pressed={role === 'PRODUCER'}
            >
              <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-lime-300 text-black">
                <AudioLines size={20} />
              </div>
              <div className="flex-1">
                <p className="font-black">Producer</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upload beats, track stats, negotiate offers.
                </p>
              </div>
              {role === 'PRODUCER' && (
                <Check size={20} className="mt-1 text-lime-300" />
              )}
            </button>

            <button
              onClick={() => setRole('ARTIST')}
              className={`flex items-start gap-4 rounded-2xl border p-4 text-left transition ${
                role === 'ARTIST'
                  ? 'border-lime-300 bg-lime-300/10'
                  : 'border-white/10 bg-white/[.03] hover:border-white/20'
              }`}
              aria-pressed={role === 'ARTIST'}
            >
              <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-lime-300 text-black">
                <Mic2 size={20} />
              </div>
              <div className="flex-1">
                <p className="font-black">Artist</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Discover beats, save favorites, link your music.
                </p>
              </div>
              {role === 'ARTIST' && (
                <Check size={20} className="mt-1 text-lime-300" />
              )}
            </button>
          </div>

          {error && (
            <p className="mt-4 text-sm font-semibold text-red-400">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={!role || loading}
            className="mt-6 w-full rounded-xl bg-lime-300 px-4 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>

          {!role && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Select a role to continue
            </p>
          )}
        </>
      )}
    </div>
  )
}
