'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

export function TagInput({
  value,
  onChange,
  max = 8,
  placeholder = 'Add tags with Enter or comma',
}: {
  value: string[]
  onChange: (tags: string[]) => void
  max?: number
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const q = draft.trim()
    if (q.length === 0) {
      setSuggestions([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tags?q=${encodeURIComponent(q)}`)
        if (res.ok) {
          const data = await res.json()
          const names: string[] = (data.tags ?? [])
            .map((t: any) => t.name as string)
            .filter((n: string) => !value.includes(n))
          setSuggestions(names)
          setHighlight(0)
          setOpen(names.length > 0)
        }
      } catch {
        setSuggestions([])
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [draft, value])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const addTag = (raw: string) => {
    const name = raw.trim().toLowerCase()
    if (!name || value.includes(name) || value.length >= max) return
    onChange([...value, name])
    setDraft('')
    setSuggestions([])
    setOpen(false)
  }

  const removeTag = (tag: string) => {
    onChange(value.filter(t => t !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (open && suggestions[highlight]) {
        addTag(suggestions[highlight])
      } else {
        addTag(draft)
      }
      return
    }

    if (e.key === 'Backspace' && draft.length === 0 && value.length > 0) {
      removeTag(value[value.length - 1])
      return
    }

    if (e.key === 'ArrowDown' && open) {
      e.preventDefault()
      setHighlight(h => Math.min(h + 1, suggestions.length - 1))
      return
    }

    if (e.key === 'ArrowUp' && open) {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
      return
    }

    if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2.5 focus-within:border-lime-300/70">
        {value.map(tag => (
          <span
            key={tag}
            className="flex items-center gap-1.5 rounded-full bg-lime-300/15 px-2.5 py-1 text-xs font-bold text-lime-300"
          >
            #{tag.replace(/\s+/g, '')}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={`Remove tag ${tag}`}
              className="hover:text-white"
            >
              <X size={12} />
            </button>
          </span>
        ))}

        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={value.length >= max ? 'Tag limit reached' : placeholder}
          disabled={value.length >= max}
          aria-label="Add a tag"
          className="min-w-32 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-[#151515] shadow-2xl">
          {suggestions.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={e => {
                  e.preventDefault()
                  addTag(s)
                }}
                className={`w-full px-3 py-2 text-left text-sm font-semibold ${
                  i === highlight ? 'bg-white/10' : ''
                }`}
              >
                #{s.replace(/\s+/g, '')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {value.length}/{max} tags · Enter or comma to add
      </p>
    </div>
  )
}
