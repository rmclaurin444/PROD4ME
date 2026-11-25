'use client'

import { useEffect, useState } from 'react'
import {
  ArrowLeftRight,
  Bell,
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Download,
  Heart,
  Loader2,
  MessageCircle,
  Play,
  Share2,
  UserRound,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/app/ui'
import { MessagesView } from '@/components/app/messages/messages-view'
import { timeAgo } from '@/components/app/messages/time'
import { BeatGrid } from '@/components/app/beat-grid'
import type { NotificationItem, NotificationType } from '@/lib/notifications'
import type { SearchedUser } from '@/components/app/messages/user-search'

const NOTIFICATION_ICONS: Record<NotificationType, LucideIcon> = {
  LIKE: Heart,
  SAVE: Bookmark,
  COMMENT: MessageCircle,
  SHARE: Share2,
  FOLLOW: UserRound,
  NEW_OFFER: Zap,
  OFFER_COUNTERED: ArrowLeftRight,
  OFFER_ACCEPTED: CheckCircle2,
  OFFER_DECLINED: XCircle,
  OFFER_PAID: Zap,
  OFFER_EXPIRED: Clock,
  LICENSE: Download,
}

export type InboxTab = 'notifications' | 'messages'

export function InboxView({
  tab,
  setTab,
  notifications,
  notificationsLoading,
  unread,
  onMarkSeen,
  onOpenNotification,
  meId,
  onOpenBeat,
  onOpenProfile,
  openConversation,
  onOpenedConversation,
  onMessagesUnreadChange,
  messagesUnread,
}: {
  tab: InboxTab
  setTab: (tab: InboxTab) => void
  notifications: NotificationItem[]
  notificationsLoading: boolean
  unread: number
  onMarkSeen: () => void
  onOpenNotification: (item: NotificationItem) => void
  meId: string
  onOpenBeat: (beatId: string) => void
  onOpenProfile: (username: string) => void
  openConversation?: { id: string; other: { id: string; name: string; username: string; avatarUrl: string | null } } | null
  onOpenedConversation?: () => void
  onMessagesUnreadChange?: (totalUnread: number) => void
  messagesUnread?: number
}) {
  // Opening the Notifications tab marks everything seen (unread → 0).
  useEffect(() => {
    if (tab === 'notifications') onMarkSeen()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-5 pb-28 pt-24 md:px-12">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand">Your activity</p>
          <h1 className="mt-2 text-4xl font-black">Inbox</h1>
        </div>
      </div>

      <div className="mt-8 flex gap-2 rounded-xl bg-surface p-1">
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
          <MessageCircle className="mr-2 inline" size={16} /> Messages{' '}
          {(messagesUnread ?? 0) > 0 && (
            <span className="ml-1 rounded-full bg-surface px-2 py-0.5 text-xs">{messagesUnread}</span>
          )}
        </button>
      </div>

      {tab === 'notifications' ? (
        notificationsLoading && notifications.length === 0 ? (
          <p className="mt-4 flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="animate-spin" size={16} /> Loading notifications…
          </p>
        ) : notifications.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-border bg-surface p-6 text-center">
            <p className="font-black">You&apos;re all caught up</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Engagement on your beats and offer activity will show up here.
            </p>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {notifications.map(item => {
              const Icon = NOTIFICATION_ICONS[item.type] ?? Bell
              return (
                <button
                  key={item.id}
                  onClick={() => onOpenNotification(item)}
                  className={`flex items-center gap-4 rounded-2xl border p-4 text-left hover:bg-surface-2 ${
                    item.unread ? 'border-brand/20 bg-brand/[.05]' : 'border-border bg-surface'
                  }`}
                >
                  <Icon className="shrink-0 text-brand" size={20} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{item.text}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{timeAgo(item.createdAt)}</p>
                  </div>
                  {item.unread && <span className="size-2 rounded-full bg-brand" />}
                </button>
              )
            })}
          </div>
        )
      ) : (
        <MessagesView
          meId={meId}
          onOpenBeat={onOpenBeat}
          onOpenProfile={onOpenProfile}
          openConversation={openConversation}
          onOpenedConversation={onOpenedConversation}
          onUnreadChange={onMessagesUnreadChange}
        />
      )}
    </div>
  )
}

/**
 * Public profile opened from search / messages. Data comes from
 * GET /api/users/[username] — no fake follower counts. Follow stays a
 * local toggle until follows are persisted.
 * TODO: persist follows (Follow table + API) so this button means something.
 */
export function UserProfile({
  user,
  following,
  onFollow,
  onMessage,
  onBack,
  onOpenBeat,
  onOpenFollowList,
  beats,
}: {
  user: {
    id: string
    name: string
    username: string
    role: string
    bio: string | null
    avatarUrl: string | null
    bannerUrl?: string | null
    followerCount?: number
    followingCount?: number
    isFollowing?: boolean
  }
  following: boolean
  onFollow: () => void
  onOpenFollowList?: (list: 'followers' | 'following') => void
  onMessage: () => Promise<void>
  onBack: () => void
  onOpenBeat: (beatId: string) => void
  beats: any[]
}) {
  const [messageBusy, setMessageBusy] = useState(false)

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-5 pb-28 pt-24 md:px-12">
      <button onClick={onBack} className="mb-8 flex items-center gap-2 text-sm font-bold text-muted-foreground">
        <ChevronLeft size={18} /> Back
      </button>

      <div className="flex items-center gap-5">
        <Avatar text={user.name} src={user.avatarUrl} size="size-20" />
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand">
            {user.role === 'ARTIST' ? 'Artist' : 'Producer'}
          </p>
          <h1 className="mt-1 text-4xl font-black">{user.name}</h1>
          <p className="text-sm font-bold text-muted-foreground">@{user.username}</p>
          <p className="mt-2 text-sm text-muted-foreground">{user.bio}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-5 text-sm text-muted-foreground">
        <button
          onClick={() => onOpenFollowList?.('followers')}
          className="font-bold hover:text-foreground"
        >
          <b className="text-foreground">{user.followerCount ?? 0}</b> followers
        </button>
        <button
          onClick={() => onOpenFollowList?.('following')}
          className="font-bold hover:text-foreground"
        >
          <b className="text-foreground">{user.followingCount ?? 0}</b> following
        </button>
      </div>

      <div className="mt-8 flex gap-3">
        <Button onClick={onFollow} className={following ? 'bg-surface-2 text-foreground' : 'bg-brand text-brand-foreground'}>
          {following ? 'Following' : 'Follow'}
        </Button>
        <Button
          onClick={async () => {
            setMessageBusy(true)
            try {
              await onMessage()
            } finally {
              setMessageBusy(false)
            }
          }}
          disabled={messageBusy}
          variant="outline"
          className="border-border"
        >
          <MessageCircle data-icon="inline-start" /> {messageBusy ? 'Starting…' : 'Message'}
        </Button>
      </div>

      <h2 className="mt-10 text-xl font-black">
        Beats · {(beats ?? []).length}
      </h2>
      {(beats ?? []).length > 0 ? (
        // Prompt 10: visitors get the same TikTok-style grid (stream counts,
        // no insights) — tapping opens the beat in the normal feed
        <div className="mt-3">
          <BeatGrid beats={beats ?? []} onOpenBeat={onOpenBeat} />
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          {user.name} hasn&apos;t uploaded any beats yet.
        </p>
      )}
    </div>
  )
}
