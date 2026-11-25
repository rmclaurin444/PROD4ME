import type { Metadata, Viewport } from 'next'
import { Providers } from '@/components/providers'
import { tryGetAppUrl } from '@/lib/app-url'
import { isStripeTestMode } from '@/lib/stripe'
import './globals.css'

const DESCRIPTION = 'Discover, upload, and negotiate the next beat on PROD4ME.'

export const metadata: Metadata = {
  // tryGetAppUrl (not getAppUrl) so a local `next build` without APP_URL
  // still works; on Railway APP_URL / RAILWAY_PUBLIC_DOMAIN are set at build.
  metadataBase: new URL(tryGetAppUrl() ?? 'http://localhost:3000'),
  title: {
    default: 'PROD4ME — Your sound. Your terms.',
    template: '%s · PROD4ME',
  },
  description: DESCRIPTION,
  applicationName: 'PROD4ME',
  openGraph: {
    type: 'website',
    siteName: 'PROD4ME',
    title: 'PROD4ME — Your sound. Your terms.',
    description: DESCRIPTION,
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Providers stripeTestMode={isStripeTestMode()}>
          {children}
        </Providers>
      </body>
    </html>
  )
}
