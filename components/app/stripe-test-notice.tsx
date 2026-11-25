'use client'

import { createContext, useContext } from 'react'
import { Info } from 'lucide-react'

/**
 * True while STRIPE_SECRET_KEY is a test key (sk_test_…). Decided on the
 * server in app/layout.tsx and provided once through <Providers>, so the
 * notice hides itself automatically with live keys.
 */
export const StripeTestModeContext = createContext(false)

export function useStripeTestMode(): boolean {
  return useContext(StripeTestModeContext)
}

export function StripeTestNotice({ className = '' }: { className?: string }) {
  const testMode = useStripeTestMode()
  if (!testMode) return null
  return (
    <div
      role="note"
      className={`flex gap-2 rounded-xl border border-border bg-background px-3 py-2 text-[11px] leading-snug text-muted-foreground ${className}`}
    >
      <Info size={14} className="mt-px shrink-0 text-foreground" aria-hidden />
      <p>
        <span className="font-bold text-foreground">Payments are in test mode.</span> No real money is
        charged. Use card 4242 4242 4242 4242, any future date, and any CVC.
      </p>
    </div>
  )
}
