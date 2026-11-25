'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { ChevronLeft, Mic2, AudioLines, Check, Music4 } from 'lucide-react'
import { TagInput } from '@/components/app/tag-input'
import { MAX_GENRES } from '@/lib/tags'
import { EmailCheckHint, useEmailCheck } from '@/components/app/email-check-hint'

type Step = 'details' | 'role' | 'genres'
type Role = 'PRODUCER' | 'ARTIST'

export default function SignUpPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('details')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [phone, setPhone] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [role, setRole] = useState<Role | null>(null)
  const [genres, setGenres] = useState<string[]>([])
  const [popularGenres, setPopularGenres] = useState<string[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const emailCheck = useEmailCheck()

  const totalSteps = role === 'ARTIST' ? 3 : 2
  const stepNumber = step === 'details' ? 1 : step === 'role' ? 2 : 3

  // live username availability (debounced)
  useEffect(() => {
    const normalized = username.trim().toLowerCase()
    if (!normalized) {
      setUsernameAvailable(null)
      setUsernameError('')
      return
    }
    if (!/^[a-z0-9_.]{3,20}$/.test(normalized)) {
      setUsernameAvailable(false)
      setUsernameError('3–20 characters: lowercase letters, numbers, "_" and "."')
      return
    }
    setUsernameError('')
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/auth/username-available?u=${encodeURIComponent(normalized)}`)
        if (!res.ok) return
        const data = await res.json()
        setUsernameAvailable(!!data.available)
        if (!data.available) setUsernameError('That username is taken')
      } catch {
        // availability check is cosmetic on the client — the server re-checks
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [username])

  const validateDetails = () => {
    if (!name.trim()) return 'Name is required'
    if (!username.trim()) return 'Username is required'
    if (usernameAvailable === false) return 'That username is taken'
    if (phone.trim() && !/^\+?[0-9\s().-]{7,}$/.test(phone.trim())) {
      return 'Enter a valid phone number (e.g. +14045551234)'
    }
    if (!email.includes('@')) return 'Please enter a valid email'
    if (emailCheck.hint && !emailCheck.hint.ok) return emailCheck.hint.message ?? 'Please enter a valid email'
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
          username: username.trim().toLowerCase(),
          phone: phone.trim() || undefined,
          email,
          password,
          role,
          ...(role === 'ARTIST' && genres.length > 0 && { genres }),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        // email problems are fixed on the details step, where the field is
        if (data.field === 'email') {
          emailCheck.setFromServer(data.error, data.suggestion)
          setStep('details')
        }
        setError(data.error || 'Registration failed')
        setLoading(false)
        return
      }

      const signInResult = await signIn('credentials', {
        identifier: email,
        password,
        redirect: false,
      })

      if (signInResult?.error) {
        setError('Account created but sign in failed. Please log in.')
        setLoading(false)
        router.push('/login')
        return
      }

      // email verification is required before using the app
      router.push('/verify-pending')
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="rounded-3xl border border-border bg-surface p-6">
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
              Username
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                className="input mt-2"
                placeholder="e.g. beatmaker_j"
                aria-label="Username"
              />
            </label>
            <span className="-mt-2 block text-xs font-semibold text-error">{usernameError}</span>
            {usernameError === '' && usernameAvailable && (
              <span className="-mt-2 block text-xs font-semibold text-success">Username available ✓</span>
            )}

            <label className="text-xs font-bold text-muted-foreground">
              Phone (optional)
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="input mt-2"
                placeholder="+14045551234"
                aria-label="Phone"
              />
            </label>
            {phoneError && (
              <span className="-mt-2 block text-xs font-semibold text-error">{phoneError}</span>
            )}

            <label className="text-xs font-bold text-muted-foreground">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  emailCheck.clear()
                }}
                onBlur={() => void emailCheck.check(email)}
                className="input mt-2"
                placeholder="you@example.com"
                aria-label="Email"
              />
            </label>
            <EmailCheckHint
              hint={emailCheck.hint}
              className="-mt-2"
              onUseSuggestion={suggestion => {
                setEmail(suggestion)
                emailCheck.clear()
                setError('')
              }}
            />

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
            <p className="mt-4 text-sm font-semibold text-error">{error}</p>
          )}

          <button
            onClick={handleContinue}
            className="mt-6 w-full rounded-xl bg-brand px-4 py-3 text-sm font-black text-brand-foreground"
          >
            Continue
          </button>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            By creating an account you agree to the{' '}
            <Link href="/terms" className="font-bold text-foreground underline underline-offset-2">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="font-bold text-foreground underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </p>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="font-bold text-brand">
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
                  ? 'border-brand bg-brand/10'
                  : 'border-border bg-surface hover:border-border'
              }`}
              aria-pressed={role === 'PRODUCER'}
            >
              <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-brand-foreground">
                <AudioLines size={20} />
              </div>
              <div className="flex-1">
                <p className="font-black">Producer</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upload beats, track stats, negotiate offers.
                </p>
              </div>
              {role === 'PRODUCER' && (
                <Check size={20} className="mt-1 text-brand" />
              )}
            </button>

            <button
              onClick={() => setRole('ARTIST')}
              className={`flex items-start gap-4 rounded-2xl border p-4 text-left transition ${
                role === 'ARTIST'
                  ? 'border-brand bg-brand/10'
                  : 'border-border bg-surface hover:border-border'
              }`}
              aria-pressed={role === 'ARTIST'}
            >
              <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-brand-foreground">
                <Mic2 size={20} />
              </div>
              <div className="flex-1">
                <p className="font-black">Artist</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Discover beats, save favorites, link your music.
                </p>
              </div>
              {role === 'ARTIST' && (
                <Check size={20} className="mt-1 text-brand" />
              )}
            </button>
          </div>

          {error && (
            <p className="mt-4 text-sm font-semibold text-error">{error}</p>
          )}

          <button
            onClick={handleRoleContinue}
            disabled={!role}
            className="mt-6 w-full rounded-xl bg-brand px-4 py-3 text-sm font-black text-brand-foreground disabled:cursor-not-allowed disabled:opacity-40"
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
                    className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-bold text-foreground/80 transition hover:border-brand/60 hover:text-brand"
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
            <p className="mt-4 text-sm font-semibold text-error">{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="mt-6 w-full rounded-xl bg-brand px-4 py-3 text-sm font-black text-brand-foreground disabled:cursor-not-allowed disabled:opacity-40"
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
