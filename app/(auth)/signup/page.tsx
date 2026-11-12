'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { ChevronLeft, Mic2, AudioLines, Check, Music4 } from 'lucide-react'
import { TagInput } from '@/components/app/tag-input'
import { MAX_GENRES } from '@/lib/tags'

type Step = 'details' | 'role' | 'genres'
type Role = 'PRODUCER' | 'ARTIST'

export default function SignUpPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('details')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [role, setRole] = useState<Role | null>(null)
  const [genres, setGenres] = useState<string[]>([])
  const [popularGenres, setPopularGenres] = useState<string[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const totalSteps = role === 'ARTIST' ? 3 : 2
  const stepNumber = step === 'details' ? 1 : step === 'role' ? 2 : 3

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

  const handleRoleContinue = () => {
    if (!role) {
      setError('Please select a role to continue')
      return
    }
    setError('')
    if (role === 'ARTIST') {
      setStep('genres')
    } else {
      handleSubmit()
    }
  }

  useEffect(() => {
    if (step !== 'genres') return
    let cancelled = false
    const loadPopularGenres = async () => {
      try {
        const res = await fetch('/api/tags?type=genre')
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setPopularGenres(
          ((data.tags ?? []) as { name: string }[])
            .map(t => t.name)
            .slice(0, MAX_GENRES),
        )
      } catch {
        // popular chips are decorative — ignore failures
      }
    }
    loadPopularGenres()
    return () => {
      cancelled = true
    }
  }, [step])

  const toggleGenre = (genre: string) => {
    setGenres(current =>
      current.includes(genre)
        ? current.filter(g => g !== genre)
        : current.length >= MAX_GENRES
          ? current
          : [...current, genre],
    )
  }

  const suggestedGenres = popularGenres.filter(g => !genres.includes(g))

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
        body: JSON.stringify({
          name,
          email,
          password,
          role,
          ...(role === 'ARTIST' && genres.length > 0 && { genres }),
        }),
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
      {step === 'details' && (
        <>
          <h1 className="text-2xl font-black">Create your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Step {stepNumber} of {totalSteps} — Your details
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
      )}

      {step === 'role' && (
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
            Step {stepNumber} of {totalSteps} — This decides your tools. It can&apos;t be changed
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
            onClick={handleRoleContinue}
            disabled={!role}
            className="mt-6 w-full rounded-xl bg-lime-300 px-4 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {role === 'ARTIST' ? 'Continue' : 'Create account'}
          </button>

          {!role && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Select a role to continue
            </p>
          )}
        </>
      )}

      {step === 'genres' && (
        <>
          <button
            onClick={() => {
              setStep('role')
              setError('')
            }}
            className="mb-4 flex items-center gap-2 text-sm font-bold text-muted-foreground"
          >
            <ChevronLeft size={18} /> Back
          </button>

          <h1 className="text-2xl font-black">What genres are you into?</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Step {stepNumber} of {totalSteps} — Up to {MAX_GENRES}. This shapes
            your Discover feed. You can change these later from your profile.
          </p>

          {suggestedGenres.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-bold text-muted-foreground">Popular on PROD4ME</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {suggestedGenres.map(genre => (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => toggleGenre(genre)}
                    className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-xs font-bold text-white/80 transition hover:border-lime-300/60 hover:text-lime-300"
                  >
                    <Music4 size={12} /> {genre}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5">
            <TagInput
              value={genres}
              onChange={setGenres}
              max={MAX_GENRES}
              suggestType="genre"
              placeholder="Type a genre (trap, drill, jazz...) and hit Enter"
            />
          </div>

          {error && (
            <p className="mt-4 text-sm font-semibold text-red-400">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="mt-6 w-full rounded-xl bg-lime-300 px-4 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            {genres.length === 0
              ? 'Optional — skip this and pick genres anytime.'
              : `${genres.length}/${MAX_GENRES} picked — you can also skip adding more.`}
          </p>
        </>
      )}
    </div>
  )
}
