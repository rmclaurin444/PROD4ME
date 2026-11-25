'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, Send } from 'lucide-react'
import { Avatar } from '@/components/app/ui'
import type { ShapedBeat } from '@/lib/beats'
import type { SearchedUser } from './user-search'
import { UserSearch } from './user-search'
import { BeatCover } from '@/components/app/beat-cover'

type RecentConversation = {
  id: string
  other: { id: string; name: string; username: string; avatarUrl: string | null }
}

/**
 * "Send in a message" — pick a recent conversation or search for someone,
 * add an optional note, and send the beat as a message. Plain-text note
 * only; the beat rides along as beatId.
 */
export function ShareBeatModal({
  beat,
  onClose,
  onSent,
}: {
  beat: ShapedBeat
  onClose: () => void
  onSent: () => void
}) {
  const [recent, setRecent] = useState<RecentConversation[] | null>(null)
  const [target, setTarget] = useState<{ conversationId: string; name: string } | null>(null)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const loadRecent = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setRecent((data.conversations ?? []).slice(0, 5))
    } catch {
      setRecent([])
    }
  }, [])

  useEffect(() => {
    void loadRecent()
  }, [loadRecent])

  const send = async () => {
    if (!target || sending) return
    setSending(true)
    setError('')
    try {
      const res = await fetch(`/api/conversations/${target.conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: note.trim(), beatId: beat.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not send')
      setSent(true)
      onSent()
      setTimeout(onClose, 700)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send')
      setSending(false)
    }
  }

  const pickUser = async (user: SearchedUser) => {
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not start the conversation')
      setTarget({ conversationId: data.conversation.id, name: data.conversation.other.name })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the conversation')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Share ${beat.title} in a message`}
        className="w-full max-w-md rounded-3xl border border-border bg-background p-6"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-xl font-black">Send “{beat.title}” in a message</h2>

        {sent ? (
          <p className="mt-8 flex items-center justify-center gap-2 py-6 text-sm font-black text-success">
            <Check size={16} /> Sent!
          </p>
        ) : target ? (
          <div className="mt-6">
            <p className="text-xs font-bold text-muted-foreground">Sending to</p>
            <p className="mt-1 font-black">{target.name}</p>
            <label className="mt-4 block text-xs font-bold text-muted-foreground">
              Note (optional)
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
                placeholder={`Check out ${beat.title}…`}
                className="input mt-2 resize-none"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- modal note field
                autoFocus
              />
            </label>
            {error && <p className="mt-2 text-xs font-semibold text-error">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                onClick={send}
                disabled={sending}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-black text-brand-foreground disabled:opacity-40"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {sending ? 'SENDING…' : 'SEND'}
              </button>
              <button
                onClick={() => setTarget(null)}
                disabled={sending}
                className="rounded-xl bg-surface-2 px-4 py-3 text-sm font-black"
              >
                Back
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6 max-h-[60vh] overflow-y-auto">
            {recent !== null && recent.length > 0 && (
              <>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Recent conversations
                </p>
                <div className="mt-2 flex flex-col gap-1">
                  {recent.map(conversation => (
                    <button
                      key={conversation.id}
                      onClick={() =>
                        setTarget({ conversationId: conversation.id, name: conversation.other.name })
                      }
                      className="flex items-center gap-3 rounded-xl p-2 text-left hover:bg-surface-2"
                    >
                      <Avatar text={conversation.other.name} src={conversation.other.avatarUrl} />
                      <span className="truncate text-sm font-bold">{conversation.other.name}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Or search
                </p>
              </>
            )}
            <div className="mt-2">
              <UserSearch onSelect={pickUser} placeholder="Search producers and artists" />
            </div>
            {sending && (
              <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 size={14} className="animate-spin" /> Starting conversation…
              </p>
            )}
            {error && <p className="mt-2 text-xs font-semibold text-error">{error}</p>}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
          <div className="flex min-w-0 items-center gap-2">
            <BeatCover
              artUrl={beat.artUrl}
              artPreset={beat.artPreset}
              title={beat.title}
              className="relative size-10 rounded-lg"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-black">{beat.title}</p>
              <p className="text-xs text-muted-foreground">
                {beat.producer} · {beat.price === 0 ? 'FREE' : `$${beat.price}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-surface-2 px-3 py-1.5 text-[10px] font-black"
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  )
}

