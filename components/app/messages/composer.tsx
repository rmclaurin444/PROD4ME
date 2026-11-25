'use client'

import { useRef, useState } from 'react'
import { Send } from 'lucide-react'
import { MESSAGE_MAX_CHARS } from '@/lib/messaging/constants'

/**
 * Message composer: auto-growing textarea, Enter sends / Shift+Enter adds a
 * line, character count appears near the 2000 limit. Clearing the draft is
 * optimistic — the thread renders the message immediately and marks it
 * "Not sent" with a retry button if the POST fails.
 */
export function Composer({
  onSend,
  disabled = false,
  disabledMessage,
}: {
  onSend: (body: string) => void
  disabled?: boolean
  disabledMessage?: string
}) {
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const autoGrow = () => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }

  const send = () => {
    const body = draft.trim()
    if (!body || body.length > MESSAGE_MAX_CHARS) return
    setDraft('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    onSend(body)
  }

  if (disabled) {
    return (
      <p className="rounded-2xl border border-border bg-surface px-4 py-3 text-center text-sm font-semibold text-muted-foreground">
        {disabledMessage ?? "You can't message this user."}
      </p>
    )
  }

  const nearLimit = draft.length >= MESSAGE_MAX_CHARS - 200

  return (
    <div className="flex items-end gap-2">
      <div className="relative flex-1">
        <textarea
          ref={inputRef}
          value={draft}
          rows={1}
          onChange={e => {
            setDraft(e.target.value)
            autoGrow()
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Write a message..."
          aria-label="Write a message"
          className="input max-h-36 resize-none pr-16"
        />
        {nearLimit && (
          <span
            className={`absolute bottom-2.5 right-3 text-[10px] font-black tabular-nums ${
              draft.length > MESSAGE_MAX_CHARS ? 'text-error' : 'text-muted-foreground'
            }`}
          >
            {draft.length}/{MESSAGE_MAX_CHARS}
          </span>
        )}
      </div>
      <button
        onClick={send}
        disabled={!draft.trim() || draft.length > MESSAGE_MAX_CHARS}
        aria-label="Send message"
        className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground disabled:opacity-40"
      >
        <Send size={17} />
      </button>
    </div>
  )
}
