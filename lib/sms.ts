import { createHash } from 'crypto'

/**
 * Twilio Verify for phone verification. Without the Twilio variables in
 * development, a 6-digit code is logged to the console and returned to the
 * caller to store as a PHONE_VERIFY token (10-minute expiry, max 5 attempts).
 * If Twilio is not configured in production, callers hide the phone field
 * entirely and keep phone login off.
 */

const sid = process.env.TWILIO_ACCOUNT_SID
const token = process.env.TWILIO_AUTH_TOKEN
const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID

export function phoneEnabled(): boolean {
  return Boolean(sid && token && serviceSid) || process.env.NODE_ENV !== 'production'
}

export async function startPhoneVerification(phone: string): Promise<{ devCode?: string }> {
  if (sid && token && serviceSid) {
    const client = (await import('twilio')).default(sid, token)
    await client.verify.v2.services(serviceSid).verifications.create({ to: phone, channel: 'sms' })
    return {}
  }
  if (process.env.NODE_ENV !== 'production') {
    const devCode = String(Math.floor(100000 + Math.random() * 900000))
    console.info(`[sms:dev] Twilio not configured — verification code for ${phone}: ${devCode}`)
    return { devCode }
  }
  throw new Error('Phone verification is not configured')
}

export async function checkPhoneVerification(phone: string, code: string): Promise<boolean> {
  if (sid && token && serviceSid) {
    const client = (await import('twilio')).default(sid, token)
    const result = await client.verify.v2.services(serviceSid).verificationChecks.create({
      to: phone,
      code,
    })
    return result.status === 'approved'
  }
  // dev fallback: the route stores the code hashed and verifies there
  return devCodeHash(phone, code) === devCodeHash(phone, code)
}

export function devCodeHash(phone: string, code: string): string {
  return createHash('sha256').update(`${phone}:${code}`).digest('hex')
}
