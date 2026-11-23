import { Resend } from 'resend'

/**
 * Email via Resend. Without RESEND_API_KEY in non-production, emails are
 * logged to the console instead of sent (matching the old devLink pattern);
 * in production a missing key throws so failures are loud.
 */

const apiKey = process.env.RESEND_API_KEY
const client = apiKey ? new Resend(apiKey) : null

export function emailEnabled(): boolean {
  return client !== null
}

export type EmailContent = {
  to: string
  subject: string
  heading: string
  lines: string[]
  ctaLabel?: string
  link?: string
}

export function templateHtml({ heading, lines, ctaLabel, link }: EmailContent): string {
  return [
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f5f5f5;border-radius:16px">',
    `<h1 style="font-size:20px;margin:0 0 8px">PROD<span style="color:#65a30d">4</span>ME</h1>`,
    `<h2 style="font-size:18px;margin:0 0 12px">${heading}</h2>`,
    ...lines.map(line => `<p style="font-size:14px;line-height:1.5;margin:0 0 10px">${line}</p>`),
    link && ctaLabel
      ? `<p style="margin:16px 0"><a href="${link}" style="display:inline-block;background:#000;color:#fff;padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:bold;font-size:14px">${ctaLabel}</a></p>`
      : '',
    '<p style="font-size:11px;color:#888;margin:16px 0 0">PROD4ME — Your sound. Your terms.</p>',
    '</div>',
  ]
    .filter(Boolean)
    .join('')
}

/** Sends an email when Resend is configured; otherwise logs it in dev. */
export async function sendEmail(content: EmailContent): Promise<{ sent: boolean }> {
  const html = templateHtml(content)
  if (!client) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(
        `[email:dev] to=${content.to} subject="${content.subject}" link=${content.link ?? '(none)'}`
      )
      return { sent: false }
    }
    throw new Error('RESEND_API_KEY is required in production')
  }
  await client.emails.send({
    from: process.env.EMAIL_FROM ?? 'PROD4ME <onboarding@resend.dev>',
    to: content.to,
    subject: content.subject,
    html,
  })
  return { sent: true }
}

export const EMAIL_TEMPLATES = {
  verifyEmail: (link: string) => ({
    subject: 'Verify your PROD4ME email',
    heading: 'Verify your email',
    lines: ['Welcome to PROD4ME. Open the link below to start using the app.'],
    ctaLabel: 'Verify email',
    link,
  }),
  confirmEmailChange: (link: string, pendingEmail: string) => ({
    subject: 'Confirm your new PROD4ME email',
    heading: 'Confirm your new email',
    lines: [`A change to <b>${pendingEmail}</b> was requested on your PROD4ME account. Open the link to confirm it.`],
    ctaLabel: 'Confirm new email',
    link,
  }),
  passwordChanged: () => ({
    subject: 'Your PROD4ME password was changed',
    heading: 'Password changed',
    lines: ['Your PROD4ME password was just changed. If this wasn’t you, reset your password immediately.'],
  }),
  emailChanged: (oldEmail: string) => ({
    subject: 'Your PROD4ME email was changed',
    heading: 'Email changed',
    lines: [
      `Your PROD4ME account email was changed from <b>${oldEmail}</b>. Sign in with the new address from now on.`,
      'If this wasn’t you, contact support immediately.',
    ],
  }),
}
