'use client'

import { Bell, ChevronLeft, MessageCircle, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/app/ui'

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

          <div className="flex items-center gap-3 border-b border-white/10 pb-5">
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
                    ? 'self-end rounded-br-sm bg-lime-300 font-semibold text-black'
                    : 'self-start rounded-bl-sm bg-white/10'
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
            <Button onClick={sendMessage} className="bg-lime-300 text-black">
              <Send />
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-lime-300">Your activity</p>
              <h1 className="mt-2 text-4xl font-black">Inbox</h1>
            </div>
            {tab === 'notifications' && unread > 0 && (
              <button onClick={() => setUnread(0)} className="text-xs font-bold text-lime-300">
                Mark all read
              </button>
            )}
          </div>

          <div className="mt-8 flex gap-2 rounded-xl bg-white/[.04] p-1">
            <button
              onClick={() => setTab('notifications')}
              className={`flex-1 rounded-lg px-4 py-3 text-sm font-black ${
                tab === 'notifications' ? 'bg-lime-300 text-black' : 'text-muted-foreground'
              }`}
            >
              <Bell className="mr-2 inline" size={16} /> Notifications{' '}
              {unread > 0 && <span className="ml-1 rounded-full bg-black/20 px-2 py-0.5 text-xs">{unread}</span>}
            </button>
            <button
              onClick={() => setTab('messages')}
              className={`flex-1 rounded-lg px-4 py-3 text-sm font-black ${
                tab === 'messages' ? 'bg-lime-300 text-black' : 'text-muted-foreground'
              }`}
            >
              <MessageCircle className="mr-2 inline" size={16} /> Messages
            </button>
          </div>

          {tab === 'notifications' ? (
            <div className="mt-4 flex flex-col gap-2">
              {notifications.map((n: any, i: number) => (
                <div
                  key={i}
                  className={`flex items-center gap-4 rounded-2xl border p-4 ${
                    n.fresh && unread ? 'border-lime-300/20 bg-lime-300/[.05]' : 'border-white/10 bg-white/[.03]'
                  }`}
                >
                  <n.icon className="shrink-0 text-lime-300" size={20} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{n.text}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{n.time}</p>
                  </div>
                  {n.fresh && unread > 0 && <span className="size-2 rounded-full bg-lime-300" />}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-2">
              {messages.map((m: any, i: number) => (
                <button
                  key={m.name}
                  onClick={() => setActiveConversation(i)}
                  className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[.03] p-4 text-left hover:bg-white/[.06]"
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
                    <span className="grid size-6 place-items-center rounded-full bg-lime-300 text-xs font-black text-black">
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

export function UserProfile({ user, count, following, onFollow, onMessage, onBack }: any) {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-5 pb-28 pt-24 md:px-12">
      <button onClick={onBack} className="mb-8 flex items-center gap-2 text-sm font-bold text-muted-foreground">
        <ChevronLeft size={18} /> Back
      </button>

      <div className="flex items-center gap-5">
        <Avatar text={user.avatar} size="size-20" />
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-lime-300">{user.role}</p>
          <h1 className="mt-1 text-4xl font-black">{user.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{user.bio}</p>
          <p className="mt-3 text-xs font-bold text-muted-foreground">
            {count.toLocaleString()} followers · {following ? 'Following' : 'Not following'}
          </p>
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <Button onClick={onFollow} className={following ? 'bg-white/10 text-white' : 'bg-lime-300 text-black'}>
          {following ? 'Following' : 'Follow'}
        </Button>
        <Button onClick={onMessage} variant="outline" className="border-white/20">
          <MessageCircle data-icon="inline-start" /> Message
        </Button>
      </div>

      <div className="mt-10 rounded-2xl border border-white/10 bg-white/[.03] p-5">
        <p className="font-black">Recent activity</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Explore {user.name}&apos;s latest beats and posts through the For You feed.
        </p>
      </div>
    </div>
  )
}
