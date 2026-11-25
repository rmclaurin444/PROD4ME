'use client'

import { useCallback, useEffect, useState } from 'react'
import type { SearchedUser } from './user-search'
import { UserSearch } from './user-search'
import { ConversationList, type ConversationSummary } from './conversation-list'
import { Thread } from './thread'
import { usePoll } from './use-poll'
import { CONVERSATION_POLL_MS } from '@/lib/messaging/constants'

export type ConversationUser = { id: string; name: string; username: string; avatarUrl: string | null }

/**
 * The Messages screen: conversation list + open thread, with the list
 * polling every 15s while visible. The "Message" button on a profile lands
 * here via `openConversation` (the conversation was just created/found by
 * the caller, who already knows the other person).
 */
export function MessagesView({
  meId,
  onOpenBeat,
  onOpenProfile,
  openConversation,
  onOpenedConversation,
  onUnreadChange,
}: {
  meId: string
  onOpenBeat: (beatId: string) => void
  onOpenProfile: (username: string) => void
  openConversation?: { id: string; other: ConversationUser } | null
  onOpenedConversation?: () => void
  onUnreadChange?: (totalUnread: number) => void
}) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeOther, setActiveOther] = useState<ConversationUser | null>(null)
  const [newMessageOpen, setNewMessageOpen] = useState(false)
  const [startError, setStartError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setConversations(data.conversations ?? [])
      onUnreadChange?.(
        (data.conversations ?? []).reduce(
          (sum: number, c: ConversationSummary) => sum + c.unreadCount,
          0
        )
      )
    } catch {
      // keep the current list on failure
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  usePoll(load, CONVERSATION_POLL_MS, true)

  // deep-open (Message button on a profile just created the conversation)
  useEffect(() => {
    if (!openConversation) return
    setActiveOther(openConversation.other)
    setActiveId(openConversation.id)
    setNewMessageOpen(false)
    onOpenedConversation?.()
  }, [openConversation, onOpenedConversation])

  const startWithUser = async (user: SearchedUser) => {
    setStartError('')
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    })
    const data = await res.json()
    if (!res.ok) {
      setStartError(data.error ?? 'Could not start the conversation')
      return
    }
    await load()
    setActiveOther(data.conversation.other)
    setActiveId(data.conversation.id)
    setNewMessageOpen(false)
  }

  const active = activeId ? (conversations.find(c => c.id === activeId) ?? null) : null

  return (
    <div className="mt-4 flex min-h-96 flex-col">
      {activeId && (active?.other ?? activeOther) ? (
        <Thread
          key={activeId}
          conversationId={activeId}
          other={(active?.other ?? activeOther)!}
          meId={meId}
          onBack={() => {
            setActiveId(null)
            setActiveOther(null)
            void load()
          }}
          onOpenProfile={onOpenProfile}
          onOpenBeat={onOpenBeat}
          onDeleted={() => {
            setActiveId(null)
            setActiveOther(null)
            void load()
          }}
        />
      ) : newMessageOpen ? (
        <div>
          <p className="mb-3 text-sm font-black">Start a conversation</p>
          <UserSearch onSelect={startWithUser} placeholder="Search producers and artists" />
          {startError && <p className="mt-2 text-xs font-semibold text-error">{startError}</p>}
        </div>
      ) : (
        <ConversationList
          conversations={conversations}
          loading={loading}
          activeId={activeId}
          meId={meId}
          onOpen={id => {
            setActiveId(id)
            setActiveOther(conversations.find(c => c.id === id)?.other ?? null)
            setNewMessageOpen(false)
          }}
          onNewMessage={() => {
            setStartError('')
            setNewMessageOpen(true)
          }}
        />
      )}
    </div>
  )
}
