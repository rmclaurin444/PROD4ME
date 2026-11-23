/**
 * Week math for the leaderboard: Monday 00:00 → Sunday 23:59 in
 * America/New_York, expressed as UTC instants. DST is handled with a
 * two-pass offset resolution.
 */
import { LEADERBOARD_TZ } from './constants.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function nyParts(instant: Date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: LEADERBOARD_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hour12: false,
  })
  const parts = Object.fromEntries(
    dtf.formatToParts(instant)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  ) as Record<string, string>
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: parts.weekday,
  }
}

function nyOffsetMs(instant: Date): number {
  const p = nyParts(instant)
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUTC - instant.getTime()
}

/** The UTC instant of a New York wall-clock time (two-pass for DST). */
function instantFromNyWallClock(year: number, month: number, day: number, hour = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour)
  const first = new Date(guess - nyOffsetMs(new Date(guess)))
  return new Date(guess - nyOffsetMs(first))
}

/** The start (Monday 00:00 NY) of the week containing `instant`. */
export function weekStartFor(instant: Date = new Date()): Date {
  const p = nyParts(instant)
  const daysSinceMonday = (WEEKDAYS.indexOf(p.weekday) + 6) % 7
  return instantFromNyWallClock(p.year, p.month, p.day - daysSinceMonday, 0)
}

export function prevWeekStart(weekStart: Date): Date {
  return new Date(weekStart.getTime() - 7 * DAY_MS)
}

/** Exclusive end of the week (next Monday 00:00 NY). */
export function weekEnd(weekStart: Date): Date {
  return new Date(weekStart.getTime() + 7 * DAY_MS)
}

/** YYYY-MM-DD (New York date) of a week's Monday — the stable week key. */
export function weekLabel(weekStart: Date): string {
  const p = nyParts(weekStart)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

/** Parses a `YYYY-MM-DD` week label back into its NY-midnight instant. */
export function parseWeekLabel(label: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(label)
  if (!m) return null
  return instantFromNyWallClock(Number(m[1]), Number(m[2]), Number(m[3]), 0)
}
