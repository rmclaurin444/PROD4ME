export const MIN_PURCHASE_CENTS = 50
export const MAX_PRICE_DOLLARS = 600

export function dollarsToCents(dollars: number) {
  return Math.round(dollars * 100)
}

export function centsToDollars(cents: number) {
  return cents / 100
}

export function formatMoney(cents: number) {
  const hasCents = cents % 100 !== 0
  return `$${(cents / 100).toFixed(hasCents ? 2 : 0)}`
}

export function isStripeSafeAmount(cents: unknown): cents is number {
  return typeof cents === 'number' && Number.isInteger(cents) && cents >= MIN_PURCHASE_CENTS
}

export function timeLeftLabel(expiresAtIso: string | null, now = Date.now()) {
  if (!expiresAtIso) return null
  const ms = new Date(expiresAtIso).getTime() - now
  if (ms <= 0) return 'Expired'
  const mins = Math.ceil(ms / 60_000)
  if (mins < 60) return `Expires in ${mins}m`
  const hours = Math.round(mins / 60)
  return `Expires in ${hours}h`
}
