'use client'

import { SessionProvider } from 'next-auth/react'
import { ThemeProvider } from 'next-themes'
import { StripeTestModeContext } from '@/components/app/stripe-test-notice'

export function Providers({
  children,
  stripeTestMode = false,
}: {
  children: React.ReactNode
  stripeTestMode?: boolean
}) {
  return (
    // attribute="class" toggles `.dark` on <html>; the choice persists in
    // localStorage per device. defaultTheme dark keeps the app's original look.
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <StripeTestModeContext.Provider value={stripeTestMode}>
        <SessionProvider>{children}</SessionProvider>
      </StripeTestModeContext.Provider>
    </ThemeProvider>
  )
}
