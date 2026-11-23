import { parsePhoneNumberFromString, CountryCode } from 'libphonenumber-js'

/**
 * Shared username + phone normalization/validation for signup, login, and
 * account settings.
 */

export const USERNAME_PATTERN = /^[a-z0-9_.]{3,20}$/

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase()
}

export function usernameError(username: string): string | null {
  const normalized = normalizeUsername(username)
  if (!normalized) return 'Username is required'
  if (normalized.length < 3 || normalized.length > 20) {
    return 'Username must be 3–20 characters'
  }
  if (!USERNAME_PATTERN.test(normalized)) {
    return 'Username may only contain lowercase letters, numbers, "_" and "."'
  }
  return null
}

/** Alias kept for call sites that shadow `usernameError` with a local. */
export const usernameValidationError = usernameError

/** E.164 phone normalization (US default, international allowed). */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const parsed = parsePhoneNumberFromString(
    trimmed,
    trimmed.startsWith('+') ? undefined : ('US' as CountryCode)
  )
  if (!parsed || !parsed.isValid()) return null
  return parsed.number
}

export function phoneError(phone: string): string | null {
  if (!phone.trim()) return 'Phone number is required'
  if (!normalizePhone(phone)) return 'Enter a valid phone number (e.g. +14045551234)'
  return null
}

/** Normalizes or returns the validation error. */
export function requirePhone(raw: string): { phone: string | null; error: string | null } {
  const phone = normalizePhone(raw)
  if (!phone) return { phone: null, error: 'Enter a valid phone number (e.g. +14045551234)' }
  return { phone, error: null }
}
