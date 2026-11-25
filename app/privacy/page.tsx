import type { Metadata } from 'next'
import { LegalPage, type LegalSection } from '@/components/legal/legal-page'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What PROD4ME collects, why, and the choices you have.',
}

// TODO: review — placeholder text. Replace every section with a reviewed
// privacy policy before launch.
const SECTIONS: LegalSection[] = [
  {
    id: 'service',
    title: 'What PROD4ME does',
    body: [
      'PROD4ME is a marketplace for producers and artists to share, stream, negotiate, and license beats. This policy explains the information we collect to run it.',
    ],
  },
  {
    id: 'eligibility',
    title: 'Accounts and eligibility',
    body: [
      'PROD4ME is for people aged 13 and older. We do not knowingly collect information from children under 13. If you believe a child under 13 has an account, contact us and we will delete it.',
    ],
  },
  {
    id: 'data',
    title: 'Data we collect',
    body: [
      'Account data: your name, username, email address, password (stored only as a secure hash), role (producer or artist), and optionally a phone number, profile picture, banner, and bio.',
      'Content: beats, artwork, playlists, comments, and messages you send.',
      'Usage and engagement data: streams, skips, likes, saves, shares, comments, follows, offers, purchases, and feed activity. We use this to run the feed and recommendations, the weekly leaderboard, and producer insights.',
      'Payment data: payments are handled by Stripe. We receive payment status and amounts, not your full card number.',
    ],
  },
  {
    id: 'content',
    title: 'User content and beat licensing',
    body: [
      'Beats, artwork, profile pictures, banners, and public profile details are visible to other users. Messages are visible only to the people in the conversation. Your email address and phone number are never shown to other users.',
    ],
  },
  {
    id: 'payments',
    title: 'Payments through Stripe',
    body: [
      'Checkout is handled by Stripe, which processes your card details under its own privacy policy.',
    ],
  },
  {
    id: 'email-sms',
    title: 'Email and SMS',
    body: [
      'We send transactional emails (email verification, password resets, security notices such as email or password changes) through our email provider, Resend.',
      'If you add a phone number, we send a one-time verification code by SMS through Twilio. We do not send marketing SMS.',
    ],
  },
  {
    id: 'deletion',
    title: 'Data deletion requests',
    body: [
      'You can ask us to delete your account and personal data by contacting us from the email address on your account. Some records (such as completed licenses and payment records) may be kept where needed for legal, tax, or fraud-prevention reasons.',
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    body: ['Privacy questions or requests: privacy@prod4me.studio (placeholder — replace with the real address).'],
  },
]

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="November 24, 2026"
      intro="This placeholder policy describes what PROD4ME collects and why. It has not been reviewed by a lawyer and will be replaced before launch."
      sections={SECTIONS}
    />
  )
}
