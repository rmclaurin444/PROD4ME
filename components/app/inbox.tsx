'use client'

import { Bell, ChevronLeft, MessageCircle, Send, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/app/ui'
import { OffersInbox } from '@/components/app/offers-inbox'

export function InboxView({
  tab,
  setTab,
  notifications,
  unread,
  setUnread,
  messages,
  activeConversation,
  setActiveConversation,
  message,
  setMessage,
  setMessages,
  role,
  refreshKey,
}: any) {
  const conversation = activeConversation !== null ? messages[activeConversation] : null

  const sendMessage = () => {
    if (!message.trim()) return
    setMessages(
      messages.map((m: any, i: number) =>
        i === activeConversation
          ? {
              ...m,
              preview: message,
              time: 'now',
              unread: 0,
              history: [...m.history, { text: message.trim(), sender: 'me', timestamp: 'now' }],
            }
          : m
      )
    )
    setMessage('')
  }

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-5 pb-28 pt-24 md:px-12">
      {conversation ? (
        <div>
          <button
            onClick={() => setActiveConversation(null)}
            className="mb-6 flex items-center gap-2 text-sm font-bold text-muted-foreground"
          >
            <ChevronLeft size={18} /> All messages
          </button>

          <div className="flex items-center gap-3 border-b border-border pb-5">
            <Avatar text={conversation.avatar} />
            <div>
              <p className="font-black">{conversation.name}</p>
              <p className="text-xs text-muted-foreground">Conversation</p>
            </div>
          </div>

          <div className="flex min-h-72 flex-col justify-end gap-3 py-6">
            {conversation.history.map((item: any, i: number) => (
              <div
                key={`${item.timestamp}-${i}`}
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                  item.sender === 'me'
                    ? 'self-end rounded-br-sm bg-brand font-semibold text-brand-foreground'
                    : 'self-start rounded-bl-sm bg-surface-2'
                }`}
              >
                {item.text}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && message.trim()) sendMessage()
              }}
              className="input"
              placeholder="Write a message..."
            />
            <Button onClick={sendMessage} className="bg-brand text-brand-foreground">
              <Send />
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-brand">Your activity</p>
              <h1 className="mt-2 text-4xl font-black">Inbox</h1>
            </div>
            {tab === 'notifications' && unread > 0 && (
              <button onClick={() => setUnread(0)} className="text-xs font-bold text-brand">
                Mark all read
              </button>
            )}
          </div>

          <div className="mt-8 flex gap-2 rounded-xl bg-surface p-1">
            <button
              onClick={() => setTab('offers')}
              className={`flex-1 rounded-lg px-4 py-3 text-sm font-black ${
                tab === 'offers' ? 'bg-brand text-brand-foreground' : 'text-muted-foreground'
              }`}
            >
              <Zap className="mr-2 inline" size={16} /> Offers
            </button>
            <button
              onClick={() => setTab('notifications')}
              className={`flex-1 rounded-lg px-4 py-3 text-sm font-black ${
                tab === 'notifications' ? 'bg-brand text-brand-foreground' : 'text-muted-foreground'
              }`}
            >
              <Bell className="mr-2 inline" size={16} /> Notifications{' '}
              {unread > 0 && <span className="ml-1 rounded-full bg-surface px-2 py-0.5 text-xs">{unread}</span>}
            </button>
            <button
              onClick={() => setTab('messages')}
              className={`flex-1 rounded-lg px-4 py-3 text-sm font-black ${
                tab === 'messages' ? 'bg-brand text-brand-foreground' : 'text-muted-foreground'
              }`}
            >
              <MessageCircle className="mr-2 inline" size={16} /> Messages
            </button>
          </div>

          {tab === 'offers' ? (
            <OffersInbox key={refreshKey} role={role} isArtist={role === 'ARTIST'} />
          ) : tab === 'notifications' ? (
            <div className="mt-4 flex flex-col gap-2">
              {notifications.map((n: any, i: number) => (
                <div
                  key={i}
                  className={`flex items-center gap-4 rounded-2xl border p-4 ${
                    n.fresh && unread ? 'border-brand/20 bg-brand/[.05]' : 'border-border bg-surface'
                  }`}
                >
                  <n.icon className="shrink-0 text-brand" size={20} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{n.text}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{n.time}</p>
                  </div>
                  {n.fresh && unread > 0 && <span className="size-2 rounded-full bg-brand" />}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {messages.map((m: any, i: number) => (
                <button
                  key={m.name}
                  onClick={() => setActiveConversation(i)}
                  className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4 text-left hover:bg-surface-2"
                >
                  <Avatar text={m.avatar} />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-3">
                      <p className="font-black">{m.name}</p>
                      <span className="text-xs text-muted-foreground">{m.time}</span>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{m.preview}</p>
                  </div>
                  {m.unread > 0 && (
                    <span className="grid size-6 place-items-center rounded-full bg-brand text-xs font-black text-brand-foreground">
                      {m.unread}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function UserProfile({ user, count, following, onFollow, onMessage, onBack, beats }: any) {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-5 pb-28 pt-24 md:px-12">
      <button onClick={onBack} className="mb-8 flex items-center gap-2 text-sm font-bold text-muted-foreground">
        <ChevronLeft size={18} /> Back
      </button>

      <div className="flex items-center gap-5">
        <Avatar text={user.avatar} size="size-20" />
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand">{user.role}</p>
          <h1 className="mt-1 text-4xl font-black">{user.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{user.bio}</p>
          <p className="mt-3 text-xs font-bold text-muted-foreground">
            {count.toLocaleString()} followers · {following ? 'Following' : 'Not following'}
          </p>
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <Button onClick={onFollow} className={following ? 'bg-surface-2 text-foreground' : 'bg-brand text-brand-foreground'}>
          {following ? 'Following' : 'Follow'}
        </Button>
        <Button onClick={onMessage} variant="outline" className="border-border">
          <MessageCircle data-icon="inline-start" /> Message
        </Button>
      </div>

      <h2 className="mt-10 text-xl font-black">
        Beats · {(beats ?? []).length}
      </h2>
      {(beats ?? []).length > 0 ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {beats.map((beat: any) => (
            <div
              key={beat.id}
              className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3"
            >
              {beat.artUrl ? (
                <img src={beat.artUrl} alt="" className="size-14 rounded-xl object-cover" />
              ) : (
                <div className="size-14 shrink-0 rounded-xl bg-surface-2" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-black">{beat.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {beat.tags.length > 0
                    ? beat.tags.map((tag: any) => `#${tag.replace(/\s+/g, '')}`).join(' ')
                    : 'no tags'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {beat.price === 0 ? (
                    <span className="rounded-full bg-brand px-2 py-0.5 font-black text-brand-foreground">FREE</span>
                  ) : (
                    `from $${beat.price}`
                  )}{' '}
                  · {beat.plays} plays
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          {user.name} hasn&apos;t uploaded any beats yet.
        </p>
      )}
    </div>
  )
}
