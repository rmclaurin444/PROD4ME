'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Monitor, Moon, Sun } from 'lucide-react'

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const

/**
 * Theme mode is per-device (next-themes, localStorage) — no database column.
 * Rendered only after mount so the server HTML and the persisted choice never
 * mismatch (no hydration flash).
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) {
    // placeholder with the same footprint keeps layout stable pre-mount
    return <div className="h-9 rounded-lg bg-surface-2" aria-hidden />
  }

  return (
    <div
      role="group"
      aria-label="Color mode"
      className="grid grid-cols-3 gap-0.5 rounded-lg border border-border bg-surface-2 p-0.5"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          aria-label={`${label} mode`}
          aria-pressed={theme === value}
          title={label}
          className={`grid size-8 place-items-center rounded-md transition ${
            theme === value
              ? 'bg-brand text-brand-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Icon size={14} />
        </button>
      ))}
    </div>
  )
}

/** Compact cycling button for tight headers: light → dark → system → light.
 *  `variant="scrim"`: dark scrim + white icon — for headers drawn over beat
 *  artwork (both modes). `variant="plain"`: token surface — for plain
 *  backgrounds like the auth pages. */
export function ThemeToggleCompact({
  variant = 'scrim',
}: {
  variant?: 'scrim' | 'plain'
}) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  const index = OPTIONS.findIndex(o => o.value === theme)
  const current = OPTIONS[index >= 0 ? index : 1]
  const next = OPTIONS[(index + 1) % OPTIONS.length]
  const Icon = current.value === 'system' ? Monitor : current.value === 'dark' ? Moon : Sun

  // The scrim variant lives in the app header, which is drawn over beat
  // artwork in the feed — like the search bar it keeps a dark scrim + white
  // icon in both modes so it stays readable on any image.
  return (
    <button
      onClick={() => setTheme(next.value)}
      aria-label={`Color mode: ${current.label}. Switch to ${next.label}`}
      title={`Color mode: ${current.label} → ${next.label}`}
      className={
        variant === 'scrim'
          ? 'grid size-9 place-items-center rounded-full border border-white/15 bg-black/30 text-white backdrop-blur transition hover:bg-black/50'
          : 'grid size-9 place-items-center rounded-full border border-border bg-surface-2 text-foreground transition hover:bg-brand hover:text-brand-foreground'
      }
    >
      <Icon size={16} />
    </button>
  )
}
