'use client'

import { useCallback, useRef, useState } from 'react'

export type EmailHint = {
  /** false only when the check definitively rejected the address */
  ok: boolean
  message?: string
  suggestion?: string
}

/**
 * On-blur email check through GET /api/auth/email-check (never the validator
 * directly). Advisory: network errors, rate limits and a stopped validator all
 * leave the hint empty — the server re-checks on submit.
 */
export function useEmailCheck() {
  const [hint, setHint] = useState<EmailHint | null>(null)
  const lastChecked = useRef('')

  const check = useCallback(async (raw: string) => {
    const email = raw.trim().toLowerCase()
    if (!email.includes('@')) {
      setHint(null)
      return
    }
    if (email === lastChecked.current) return
    lastChecked.current = email
    try {
      const res = await fetch(`/api/auth/email-check?email=${encodeURIComponent(email)}`, { cache: 'no-store' })
      if (!res.ok) {
        setHint(null)
        return
      }
      const data = await res.json()
      // ignore stale answers if the field changed while checking
      if (lastChecked.current !== email) return
      setHint(
        data.ok && !data.suggestion
          ? null
          : { ok: Boolean(data.ok), message: data.message, suggestion: data.suggestion }
      )
    } catch {
      setHint(null)
    }
  }, [])

  /** Server-side rejection on submit (register / change-email 400 with field: 'email'). */
  const setFromServer = useCallback((message: string, suggestion?: string) => {
    setHint({ ok: false, message, suggestion })
  }, [])

  const clear = useCallback(() => {
    lastChecked.current = ''
    setHint(null)
  }, [])

  return { hint, check, clear, setFromServer }
}

/** Error text plus a clickable "Did you mean name@gmail.com?" that fills the field. */
export function EmailCheckHint({
  hint,
  onUseSuggestion,
  className = '',
}: {
  hint: EmailHint | null
  onUseSuggestion: (suggestion: string) => void
  className?: string
}) {
  if (!hint) return null
  return (
    <div className={`text-xs font-semibold ${className}`} aria-live="polite">
      {hint.message && <p className="text-error">{hint.message}</p>}
      {hint.suggestion && (
        <p className="mt-1 text-muted-foreground">
          Did you mean{' '}
          <button
            type="button"
            onClick={() => onUseSuggestion(hint.suggestion!)}
            className="font-black text-foreground underline underline-offset-2"
          >
            {hint.suggestion}
          </button>
          ?
        </p>
      )}
    </div>
  )
}
