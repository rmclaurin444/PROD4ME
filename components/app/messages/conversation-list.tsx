'use client'

import { Plus } from 'lucide-react'
import { Avatar } from '@/components/app/ui'
import { timeAgo } from './time'

export type ConversationSummary = {
  id: string
  lastMessageAt: string
  unreadCount: number
  other: { id: string; name: string; username: string; avatarUrl: string | null }
  lastMessage: { body: string; senderId: string; createdAt: string; hasBeat: boolean } | null
}

export function ConversationList({
  conversations,
  loading,
  activeId,
  meId,
  onOpen,
  onNewMessage,
}: {
  conversations: ConversationSummary[]
  loading: boolean
  activeId: string | null
  meId: string
  onOpen: (id: string) => void
  onNewMessage: () => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={onNewMessage}
        className="flex items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-black text-brand-foreground"
      >
        <Plus size={16} /> New message
      </button>

      {loading && conversations.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading conversations…</p>
      )}

      {!loading && conversations.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="font-black">No messages yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Find a producer or artist to start a conversation.
          </p>
        </div>
      )}

      {conversations.map(conversation => {
        const preview = conversation.lastMessage
        const mine = preview?.senderId === meId
        const previewText = preview
          ? preview.body
            ? `${mine ? 'You: ' : ''}${preview.body}`
            : `${mine ? 'You shared a beat' : 'Shared a beat'}`
          : 'No messages yet'
        return (
          <button
            key={conversation.id}
            onClick={() => onOpen(conversation.id)}
            className={`flex items-center gap-3 rounded-2xl border p-4 text-left ${
              activeId === conversation.id
                ? 'border-brand/20 bg-brand/[.05]'
                : 'border-border bg-surface hover:bg-surface-2'
            }`}
          >
            <Avatar text={conversation.other.name} src={conversation.other.avatarUrl} />
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-3">
                <p className="truncate font-black">{conversation.other.name}</p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {timeAgo(preview?.createdAt ?? conversation.lastMessageAt)}
                </span>
              </div>
              <p
                className={`mt-0.5 truncate text-sm ${
                  conversation.unreadCount > 0
                    ? 'font-black text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                {previewText}
              </p>
            </div>
            {conversation.unreadCount > 0 && (
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-black text-brand-foreground">
                {conversation.unreadCount}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
