import type { Metadata } from 'next'
import { LegalPage, type LegalSection } from '@/components/legal/legal-page'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that apply when you use PROD4ME.',
}

// TODO: review — placeholder text. Replace every section with reviewed terms
// before launch.
const SECTIONS: LegalSection[] = [
  {
    id: 'service',
    title: 'What PROD4ME does',
    body: [
      'PROD4ME is a marketplace where producers upload beats and artists discover, stream, make offers on, and license them.',
      'We may change, add, or remove features at any time. Some features (such as Studio) may be marked as coming soon or experimental.',
    ],
  },
  {
    id: 'accounts',
    title: 'Accounts and eligibility',
    body: [
      'You must be at least 13 years old to create an account. If you are under the age of majority where you live, you may only use PROD4ME with the permission of a parent or legal guardian.',
      'You are responsible for your account, for keeping your password secure, and for everything that happens under your account. You must give accurate information, including a working email address that you verify.',
      'We may suspend or close accounts that break these terms or harm other users.',
    ],
  },
  {
    id: 'content',
    title: 'Your content and beat licensing',
    body: [
      'You keep ownership of the beats, artwork, profile images, messages, and other content you upload. You give PROD4ME a license to host, store, display, stream, and distribute that content as needed to run the service.',
      'Producers confirm they own or have the rights to everything they upload, and that it does not infringe anyone else’s rights.',
      'When an artist obtains a license (paid or free), the license type shown at checkout (non-exclusive or exclusive) defines what the artist may do with the beat. Exclusive licenses remove the beat from further exclusive sale.',
      'Do not upload content that is illegal, infringing, hateful, or harassing. We may remove content that breaks these rules.',
    ],
  },
  {
    id: 'payments',
    title: 'Payments',
    body: [
      'Payments are processed by Stripe. PROD4ME does not store your full card details. Stripe’s own terms and privacy policy also apply to payments.',
      'Prices are set by producers. Offers expire if they are not answered or paid in time. Except where required by law, completed license purchases are final.',
    ],
  },
  {
    id: 'termination',
    title: 'Ending your use of PROD4ME',
    body: [
      'You may stop using PROD4ME at any time and request deletion of your account (see the Privacy Policy). Licenses already granted to artists continue after a producer leaves.',
    ],
  },
  {
    id: 'disclaimers',
    title: 'Disclaimers and liability',
    body: [
      'PROD4ME is provided “as is” without warranties of any kind. To the extent allowed by law, PROD4ME is not liable for indirect or consequential damages arising from your use of the service.',
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    body: ['Questions about these terms: contact@prod4me.studio (placeholder — replace with the real address).'],
  },
]

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="November 24, 2026"
      intro="These placeholder terms describe how PROD4ME works. They have not been reviewed by a lawyer and will be replaced before launch."
      sections={SECTIONS}
    />
  )
}
