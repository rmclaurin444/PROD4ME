'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, Ellipsis, Loader2 } from 'lucide-react'
import { Avatar } from '@/components/app/ui'
import { formatMoney } from '@/lib/money'
import { BeatCover } from '@/components/app/beat-cover'
import type { ShapedMessageBeat } from '@/lib/messaging'
import {
  MESSAGE_GROUP_WINDOW_MS,
  MESSAGE_MAX_CHARS,
  MESSAGE_POLL_MS,
} from '@/lib/messaging/constants'
import { usePoll } from './use-poll'
import { clockTime, dayLabel } from './time'
import { Composer } from './composer'

type ThreadMessage = {
  id: string
  body: string
  senderId: string
  createdAt: string
  beat: ShapedMessageBeat | null
  /** client-side send state for optimistic messages */
  status?: 'sending' | 'failed'
}

/**
 * Message text is rendered as plain text only. Links become anchors only
 * when they start with http:// or https:// — everything else stays literal
 * text (never HTML).
 */
const LINK_PATTERN = /(https?:\/\/[^\s]+)/g

function MessageBody({ text }: { text: string }) {
  const parts = text.split(LINK_PATTERN)
  return (
    <p className="whitespace-pre-wrap break-words text-sm">
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <a
            key={index}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </p>
  )
}

function BeatCard({
  beat,
  onOpenBeat,
}: {
  beat: ShapedMessageBeat
  onOpenBeat: (beatId: string) => void
}) {
  return (
    <button
      onClick={() => onOpenBeat(beat.id)}
      className="mt-1 flex w-full max-w-xs items-center gap-3 rounded-2xl border border-border bg-surface p-3 text-left hover:bg-surface-2"
    >
      <BeatCover
        artUrl={beat.artUrl}
        artPreset={beat.artPreset}
        title={beat.title}
        className="relative size-12 shrink-0 rounded-xl"
      />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-sm">{beat.title}</b>
        <small className="block text-xs text-muted-foreground">{beat.producer}</small>
        <small className="text-xs font-black text-foreground">
          {beat.price === 0 ? 'FREE' : `$${beat.price}`}
        </small>
      </span>
    </button>
  )
}

export function Thread({
  conversationId,
  other,
  meId,
  onBack,
  onOpenProfile,
  onOpenBeat,
  onDeleted,
}: {
  conversationId: string
  other: { id: string; name: string; username: string; avatarUrl: string | null }
  meId: string
  onBack: () => void
  onOpenProfile: (username: string) => void
  onOpenBeat: (beatId: string) => void
  onDeleted: () => void
}) {
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmBlock, setConfirmBlock] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const prependHeightRef = useRef<number | null>(null)
  const stickToBottomRef = useRef(true)

  const load = useCallback(
    async (cursor?: string) => {
      const params = cursor ? `?before=${encodeURIComponent(cursor)}` : ''
      const res = await fetch(`/api/conversations/${conversationId}/messages${params}`, {
        cache: 'no-store',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not load messages')
      return data as { messages: ThreadMessage[]; hasMore: boolean; blocked: boolean }
    },
    [conversationId]
  )

  // initial load + conversation switch
  useEffect(() => {
    setMessages(null)
    setHasMore(false)
    setBlocked(false)
    setConfirmBlock(false)
    setMenuOpen(false)
    stickToBottomRef.current = true
    let cancelled = false
    load()
      .then(data => {
        if (cancelled) return
        setMessages(data.messages)
        setHasMore(data.hasMore)
        setBlocked(data.blocked)
      })
      .catch(() => {
        if (!cancelled) setMessages([])
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  // opening a thread marks it read
  useEffect(() => {
    void fetch(`/api/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => {})
  }, [conversationId])

  const mergeIncoming = useCallback((incoming: ThreadMessage[]) => {
    if (incoming.length === 0) return
    setMessages(current => {
      if (current === null) return current
      const known = new Set(current.map(m => m.id))
      const fresh = incoming.filter(m => !known.has(m.id))
      if (fresh.length === 0) return current
      return [...current, ...fresh].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    })
  }, [])

  // poll for messages newer than the newest one rendered (4s, visible only)
  usePoll(
    () => {
      const newest = messages?.length ? messages[messages.length - 1] : null
      if (!newest) return
      void fetch(`/api/conversations/${conversationId}/messages?after=${encodeURIComponent(newest.id)}`, {
        cache: 'no-store',
      })
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
          if (!data) return
          mergeIncoming(data.messages ?? [])
          if (data.messages?.length > 0) {
            // new activity while open → mark read
            void fetch(`/api/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => {})
          }
        })
        .catch(() => {})
    },
    MESSAGE_POLL_MS,
    true
  )

  // scroll management: keep position when prepending older history,
  // follow the bottom only when the user is already near it
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || messages === null) return
    if (prependHeightRef.current !== null) {
      el.scrollTop += el.scrollHeight - prependHeightRef.current
      prependHeightRef.current = null
      return
    }
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  const loadOlder = async () => {
    if (!messages?.length || loadingOlder) return
    setLoadingOlder(true)
    try {
      prependHeightRef.current = scrollRef.current?.scrollHeight ?? null
      const data = await load(messages[0].id)
      setMessages(current => {
        const known = new Set((current ?? []).map(m => m.id))
        return [...(data.messages ?? []).filter(m => !known.has(m.id)), ...(current ?? [])]
      })
      setHasMore(data.hasMore)
    } catch {
      prependHeightRef.current = null
    } finally {
      setLoadingOlder(false)
    }
  }

  const send = useCallback(
    async (body: string, retryOf?: ThreadMessage) => {
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const optimistic: ThreadMessage = retryOf
        ? { ...retryOf, status: 'sending' }
        : { id: tempId, body, senderId: meId, createdAt: new Date().toISOString(), beat: null, status: 'sending' }

      setMessages(current => (current ? [...current, optimistic] : [optimistic]))
      stickToBottomRef.current = true

      try {
        const res = await fetch(`/api/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Send failed')
        setMessages(current =>
          (current ?? []).map(m => (m.id === optimistic.id ? { ...m, id: data.message.id, status: undefined } : m))
        )
      } catch {
        setMessages(current =>
          (current ?? []).map(m => (m.id === optimistic.id ? { ...m, status: 'failed' } : m))
        )
      }
    },
    [conversationId, meId]
  )

  const retry = (message: ThreadMessage) => {
    setMessages(current => (current ?? []).filter(m => m.id !== message.id))
    void send(message.body, message)
  }

  const blockUser = async () => {
    setConfirmBlock(false)
    setMenuOpen(false)
    await fetch('/api/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: other.id }),
    }).catch(() => {})
    setBlocked(true)
  }

  const deleteConversation = async () => {
    setMenuOpen(false)
    await fetch(`/api/conversations/${conversationId}`, { method: 'DELETE' }).catch(() => {})
    onDeleted()
  }

  // render model: day separators + send clusters
  const rendered: React.ReactNode[] = []
  let lastMessage: ThreadMessage | null = null
  let lastDay = ''
  if (messages) {
    messages.forEach((message, index) => {
      const day = dayLabel(message.createdAt)
      if (day !== lastDay) {
        rendered.push(
          <div key={`day-${message.createdAt}`} className="my-4 flex justify-center">
            <span className="rounded-full bg-surface-2 px-3 py-1 text-[10px] font-black text-muted-foreground">
              {day}
            </span>
          </div>
        )
        lastDay = day
        lastMessage = null
      }

      const mine = message.senderId === meId
      const prev = lastMessage as ThreadMessage | null
      const sameCluster =
        prev !== null &&
        prev.senderId === message.senderId &&
        new Date(message.createdAt).getTime() - new Date(prev.createdAt).getTime() <
          MESSAGE_GROUP_WINDOW_MS

      rendered.push(
        <div
          key={message.id}
          className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
        >
          {message.beat && (
            <BeatCard beat={message.beat} onOpenBeat={onOpenBeat} />
          )}
          {(message.body || !message.beat) && (
            <div
              className={`max-w-[80%] px-4 py-2.5 text-sm ${
                mine
                  ? 'rounded-2xl bg-brand font-semibold text-brand-foreground'
                  : 'rounded-2xl bg-surface-2 text-foreground'
              } ${
                sameCluster
                  ? mine
                    ? 'rounded-tr-sm'
                    : 'rounded-tl-sm'
                  : ''
              } ${message.status === 'failed' ? 'opacity-80' : ''}`}
            >
              <MessageBody text={message.body} />
            </div>
          )}
          {message.status === 'sending' && (
            <span className="mt-0.5 text-[10px] font-bold text-muted-foreground">Sending…</span>
          )}
          {message.status === 'failed' && (
            <span className="mt-0.5 flex items-center gap-2 text-[10px] font-black text-error">
              Not sent
              <button onClick={() => retry(message)} className="underline underline-offset-2">
                Retry
              </button>
            </span>
          )}
          {!sameCluster && message.status === undefined && (
            <span className="mt-0.5 text-[10px] text-muted-foreground">
              {clockTime(message.createdAt)}
            </span>
          )}
          {index === messages.length - 1 && sameCluster && message.status === undefined && (
            <span className="mt-0.5 text-[10px] text-muted-foreground">
              {clockTime(message.createdAt)}
            </span>
          )}
        </div>
      )
      lastMessage = message
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <button
          onClick={onBack}
          aria-label="Back to conversations"
          className="text-sm font-bold text-muted-foreground"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          onClick={() => onOpenProfile(other.username)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <Avatar text={other.name} src={other.avatarUrl} />
          <span className="min-w-0">
            <b className="block truncate font-black">{other.name}</b>
            <small className="block text-xs text-muted-foreground">@{other.username}</small>
          </span>
        </button>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(open => !open)}
            aria-label="Conversation options"
            className="grid size-9 place-items-center rounded-full hover:bg-surface-2"
          >
            <Ellipsis size={18} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-10 z-30 w-48 rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-2xl">
              {confirmBlock ? (
                <div className="p-2">
                  <p className="text-xs font-bold">Block {other.name}?</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    You won&apos;t be able to message each other.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={blockUser}
                      className="flex-1 rounded-lg bg-error px-2 py-1.5 text-[10px] font-black text-error-foreground"
                    >
                      BLOCK
                    </button>
                    <button
                      onClick={() => setConfirmBlock(false)}
                      className="flex-1 rounded-lg bg-surface-2 px-2 py-1.5 text-[10px] font-black"
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setConfirmBlock(true)
                    }}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-error hover:bg-surface-2"
                  >
                    Block
                  </button>
                  <button
                    onClick={deleteConversation}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold hover:bg-surface-2"
                  >
                    Delete conversation
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={e => {
          const el = e.currentTarget
          stickToBottomRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 120
        }}
        className="min-h-80 flex-1 overflow-y-auto py-4"
      >
        {messages === null ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="animate-spin" size={16} /> Loading messages…
          </p>
        ) : (
          <>
            {hasMore && (
              <div className="flex justify-center pb-4">
                <button
                  onClick={loadOlder}
                  disabled={loadingOlder}
                  className="rounded-full border border-border px-4 py-1.5 text-[10px] font-black hover:bg-surface-2 disabled:opacity-40"
                >
                  {loadingOlder ? 'LOADING…' : 'LOAD OLDER MESSAGES'}
                </button>
              </div>
            )}
            {messages.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No messages yet. Say hello.
              </p>
            )}
            {rendered}
          </>
        )}
      </div>

      <div className="pt-3">
        <Composer
          onSend={send}
          disabled={blocked}
          disabledMessage="You can't message this user."
        />
        {!blocked && (
          <p className="mt-1 text-right text-[10px] text-muted-foreground">
            Enter to send · Shift+Enter for a new line
          </p>
        )}
      </div>
    </div>
  )
}

