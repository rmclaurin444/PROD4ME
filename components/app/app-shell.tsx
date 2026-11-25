'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Sidebar, MobileNav } from '@/components/app/sidebar'
import { Header } from '@/components/app/header'
import { Feed } from '@/components/app/feed'
import { UploadView } from '@/components/app/upload'
import { Dashboard } from '@/components/app/dashboard'
import { ProducerProfile, ArtistProfile } from '@/components/app/profiles'
import { InboxView, UserProfile, type InboxTab } from '@/components/app/inbox'
import { FollowListModal } from '@/components/app/follow-list-modal'
import { Comments, PostTrack } from '@/components/app/modals'
import { PurchaseModal, type PurchaseMode } from '@/components/app/purchase-modal'
import { PriceEditor } from '@/components/app/price-editor'
import { EditProfile } from '@/components/app/edit-profile'
import { themes, getInitials } from '@/components/app/data'
import type { SearchedUser } from '@/components/app/messages/user-search'
import { ShareBeatModal } from '@/components/app/messages/share-beat-modal'
import { usePoll } from '@/components/app/messages/use-poll'
import { MESSAGES_UNREAD_POLL_MS } from '@/lib/messaging/constants'
import type { ShapedBeat } from '@/lib/beats'
import type { ShapedLicense } from '@/lib/offers'
import type { ShapedPlaylist } from '@/lib/playlists'
import type { NotificationItem } from '@/lib/notifications'
import { CheckCircle2, RotateCw, UserRoundPlus } from 'lucide-react'
import { Avatar } from '@/components/app/ui'
import { LeaderboardView } from '@/components/app/leaderboard'
import { SettingsView } from '@/components/app/settings'
import { PreviewOverlay } from '@/components/app/preview-overlay'
import type { View } from '@/components/app/nav'
import { trackEvent } from '@/lib/recommendations/track'
import { SKIP_UNDER_MILLIS } from '@/lib/recommendations/constants'

const DEFAULT_BANNER =
  'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1400&q=80'

type SessionUser = {
  id: string
  name: string
  email: string
  role: string
  bio?: string | null
  banner?: string | null
  theme?: string | null
  avatar?: string | null
  emailVerified?: boolean
  followerCount?: number
  followingCount?: number
}

/** Real profile data from GET /api/users/[username]. */
type ProfileUser = {
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

export function AppShell({
  user,
  beats,
  library,
  openOffers,
  producers,
  playlists = [],
  isAdmin,
}: {
  user: SessionUser
  beats: ShapedBeat[]
  library: ShapedLicense[]
  openOffers: number
  producers: { id: string; name: string; username: string; avatar: string | null; bio: string | null }[]
  playlists?: ShapedPlaylist[]
  /** Admin-only: shows the /dev panel link in the sidebar. */
  isAdmin?: boolean
}) {
  const router = useRouter()
  const isArtist = user.role === 'ARTIST'
  const isProducer = user.role === 'PRODUCER'
  const avatarText = getInitials(user.name)

  const initialTheme = themes.find(t => t.id === user.theme) ?? themes[0]

  const [view, setView] = useState<View>('feed')
  const [index, setIndex] = useState(0)
  // feed data now streams from GET /api/feed (personalized + explore +
  // cursor pagination). `beats` (server props) still serve profile/dashboard.
  // Prompt 12: the session persists to sessionStorage (per user, 30 min) and
  // restores on reload; no more `%` wrap — index runs one past the end for
  // the "all caught up" card.
  // Prompt 13: per-tab sessions — feedBeats/index/feedCursor are the ACTIVE
  // tab's state; both tabs are kept in sessionsRef and persisted under
  // per-mode keys.
  const [feedBeats, setFeedBeats] = useState<ShapedBeat[]>([])
  const [feedCursor, setFeedCursor] = useState<string | null>(null)
  const [feedTag, setFeedTag] = useState<string | null>(null)
  const [feedLoading, setFeedLoading] = useState(false)
  const feedLoadingRef = useRef(false)
  const [refreshing, setRefreshing] = useState(false)
  const [feedToast, setFeedToast] = useState('')
  const toastTimer = useRef<number | null>(null)
  /** saved return-tab session while a tag feed is active (Prompt 12 B.4) */
  const returnFeedRef = useRef<{ beats: ShapedBeat[]; index: number; cursor: string | null } | null>(null)
  const navLockRef = useRef(0)
  const skipFirstTagEffectRef = useRef(true)
  // Prompt 13: feed tabs
  const [feedMode, setFeedMode] = useState<'foryou' | 'following'>('foryou')
  const [followedIds, setFollowedIds] = useState<string[]>([])
  const [hasNewFollowing, setHasNewFollowing] = useState(false)
  const [followingSuggestions, setFollowingSuggestions] = useState<
    Array<{ id: string; name: string; username: string; avatarUrl: string | null; coverUrl: string | null; isFollowing: boolean }>
  >([])
  const [followingLoaded, setFollowingLoaded] = useState(false)
  const sessionsRef = useRef<
    Record<'foryou' | 'following', { beats: ShapedBeat[]; index: number; cursor: string | null }>
  >({
    foryou: { beats: [], index: 0, cursor: null },
    following: { beats: [], index: 0, cursor: null },
  })
  const [saved, setSaved] = useState<string[]>([])
  const [liked, setLiked] = useState<string[]>([])
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>(
    Object.fromEntries(beats.map(b => [b.id, b.likes]))
  )
  const [shareCounts, setShareCounts] = useState<Record<string, number>>(
    Object.fromEntries(beats.map(b => [b.id, b.shares]))
  )
  const [saveCounts, setSaveCounts] = useState<Record<string, number>>(
    Object.fromEntries(beats.map(b => [b.id, b.saves]))
  )
  const [purchase, setPurchase] = useState<{ mode: PurchaseMode } | null>(null)
  const [libraryState, setLibraryState] = useState<ShapedLicense[]>(library)
  const [editPriceBeat, setEditPriceBeat] = useState<ShapedBeat | null>(null)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [addedComments, setAddedComments] = useState<
    Record<string, { name: string; avatar: string; text: string }[]>
  >({})
  const [edit, setEdit] = useState(false)
  const [theme, setTheme] = useState(initialTheme)
  const [banner, setBanner] = useState(user.banner ?? DEFAULT_BANNER)
  const [bio, setBio] = useState(
    user.bio ?? (isArtist ? 'Artist on PROD4ME.' : 'Producer on PROD4ME.')
  )
  const [profileUser, setProfileUser] = useState<ProfileUser | null>(null)
  const [profileBeats, setProfileBeats] = useState<ShapedBeat[]>([])
  const [avatar, setAvatar] = useState(user.avatar ?? null)
  const [tracks, setTracks] = useState<
    { title: string; url: string; beat: string; art: string | null }[]
  >([])
  const [postOpen, setPostOpen] = useState(false)
  const [inboxTab, setInboxTab] = useState<InboxTab>('notifications')
  /** a conversation to deep-open in Messages (from the profile Message button) */
  const [openConversation, setOpenConversation] = useState<{
    id: string
    other: { id: string; name: string; username: string; avatarUrl: string | null }
  } | null>(null)
  const [messagesUnread, setMessagesUnread] = useState(0)
  /** beat queued for the "Send in a message" modal */
  const [shareBeat, setShareBeat] = useState<ShapedBeat | null>(null)
  /** owner preview overlay (Prompt 10): the producer's own beats in grid order */
  const [preview, setPreview] = useState<{ beats: ShapedBeat[]; startIndex: number } | null>(null)
  /** Prompt 13: paged follower/following list opened from a profile */
  const [followList, setFollowList] = useState<{ username: string; list: 'followers' | 'following' } | null>(null)

  useEffect(() => {
    // re-sync the library when the server sends refreshed props (post license grant)
    setLibraryState(library)
  }, [library])

  // ---- notifications (real data via GET /api/notifications) -----------------
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [notificationsLoading, setNotificationsLoading] = useState(true)
  const [unread, setUnread] = useState(0)
  /** Section id to scroll to after a view switch (offer items → Offers). */
  const pendingScrollRef = useRef<string | null>(null)

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setNotifications(data.items ?? [])
      setUnread(data.unreadCount ?? 0)
    } catch {
      // notifications are non-critical — keep whatever we have on failure
    } finally {
      setNotificationsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadNotifications()
  }, [loadNotifications])

  /** Opening the Notifications tab marks everything seen (unread → 0). */
  const markNotificationsSeen = useCallback(() => {
    setUnread(0)
    setNotifications(current =>
      current.map(item => (item.unread ? { ...item, unread: false } : item))
    )
    void fetch('/api/notifications', { method: 'POST' }).catch(() => {})
  }, [])

  // ---- messages unread badge (polls every 30s anywhere) ---------------------
  const refreshMessagesUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/messages/unread-count', { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json()
      setMessagesUnread(data.count ?? 0)
    } catch {
      // badge is non-critical
    }
  }, [])

  usePoll(refreshMessagesUnread, MESSAGES_UNREAD_POLL_MS, true)

  // refresh the badge immediately on view/tab changes (e.g. after reading a thread)
  useEffect(() => {
    void refreshMessagesUnread()
  }, [view, inboxTab, refreshMessagesUnread])

  /** Engagement items open the beat in the feed. The producer's own beats
   *  never appear in their own Discover feed, so a missing beat is fetched
   *  and injected at the top instead of silently doing nothing. */
  const openBeat = useCallback(
    async (beatId: string) => {
      setProfileUser(null)
      const existing = feedBeats.findIndex(b => b.id === beatId)
      if (existing >= 0) {
        setView('feed')
        setIndex(existing)
        return
      }
      try {
        const res = await fetch('/api/beats', { cache: 'no-store' })
        if (res.ok) {
          const data = await res.json()
          const shaped: ShapedBeat | undefined = (data.beats ?? []).find(
            (b: ShapedBeat) => b.id === beatId
          )
          if (shaped) {
            setFeedTag(null)
            setFeedBeats(current => [shaped, ...current.filter(b => b.id !== beatId)])
            setIndex(0)
            setView('feed')
            return
          }
        }
      } catch {
        // fall through to the plain feed view
      }
      setView('feed')
    },
    [feedBeats]
  )

  /** Offer/license items open the Offers section: the producer dashboard for
   *  producers, the artist profile for artists. The scroll happens once the
   *  target view has rendered (see pendingScrollRef below). */
  const openOffersSection = useCallback(() => {
    setProfileUser(null)
    setView(isProducer ? 'dashboard' : 'profile')
    pendingScrollRef.current = 'offers-section'
  }, [isProducer])

  const openNotification = useCallback(
    (item: NotificationItem) => {
      if (item.action.kind === 'beat') void openBeat(item.action.beatId)
      else openOffersSection()
    },
    [openBeat, openOffersSection]
  )

  useEffect(() => {
    if (!pendingScrollRef.current) return
    const target = document.getElementById(pendingScrollRef.current)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
      pendingScrollRef.current = null
    }
  }, [view])

  /** Prompt 15: email buttons link to `/?open=…` (lib/emails/shared.ts
   *  appLinks). Handled once on load; the query is then removed so a reload
   *  doesn't re-trigger it. */
  const [settingsFocus, setSettingsFocus] = useState<string | null>(null)
  const deepLinkHandled = useRef(false)
  useEffect(() => {
    if (deepLinkHandled.current) return
    deepLinkHandled.current = true
    const params = new URLSearchParams(window.location.search)
    const open = params.get('open')
    if (!open) return
    params.delete('open')
    const beatId = params.get('id')
    params.delete('id')
    const section = params.get('section')
    params.delete('section')
    const rest = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`)

    if (open === 'offers') {
      openOffersSection()
    } else if (open === 'library') {
      setProfileUser(null)
      setView('profile')
      pendingScrollRef.current = 'library-section'
    } else if (open === 'dashboard') {
      setProfileUser(null)
      setView('dashboard')
    } else if (open === 'beat' && beatId) {
      void openBeat(beatId)
    } else if (open === 'settings') {
      setSettingsFocus(section && /^[a-z-]+$/.test(section) ? section : null)
      setView('settings')
    }
  }, [openBeat, openOffersSection])

  /** Opens the real public profile (GET /api/users/[username]). */
  const openProfile = useCallback(async (username: string) => {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) return
      setProfileUser(data.user)
      setProfileBeats(data.beats ?? [])
    } catch {
      // profile fetch is best-effort
    }
  }, [])

  const handleFeedTagTap = (tagName: string) => {
    setFeedTag(tagName === feedTag ? null : tagName)
  }

  const clearFeedTag = () => setFeedTag(null)

  // ---- personalized feed loading (server: lib/recommendations/*) -----------
  const loadFeed = async (
    tag: string | null,
    mode: 'replace' | 'append',
    cursor: string | null = null,
    feed: 'foryou' | 'following' = 'foryou',
  ) => {
    if (feedLoadingRef.current) return
    feedLoadingRef.current = true
    setFeedLoading(true)
    try {
      const params = new URLSearchParams()
      if (tag) params.set('tag', tag)
      if (cursor) params.set('cursor', cursor)
      if (feed === 'following' && !tag) params.set('mode', 'following')
      const res = await fetch(`/api/feed${params.size > 0 ? `?${params.toString()}` : ''}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Feed failed')
      const page: ShapedBeat[] = data.beats ?? []
      const nextCursor: string | null = data.nextCursor ?? null

      const applySession = (updater: (current: ShapedBeat[]) => ShapedBeat[]) => {
        if (feed === feedMode) {
          setFeedBeats(updater)
        } else {
          sessionsRef.current[feed] = {
            ...sessionsRef.current[feed],
            beats: updater(sessionsRef.current[feed].beats),
          }
        }
      }

      if (mode === 'replace') {
        applySession(() => page)
        setIndex(0)
        if (feed !== feedMode) sessionsRef.current[feed].index = 0
      } else {
        // append, deduping against anything already on the client
        applySession(current => {
          const known = new Set(current.map(beat => beat.id))
          const fresh = page.filter(beat => !known.has(beat.id))
          return [...current, ...fresh]
        })
      }
      if (feed !== feedMode) sessionsRef.current[feed].cursor = nextCursor
      else setFeedCursor(nextCursor)
    } catch {
      // keep the current feed on failure
    } finally {
      feedLoadingRef.current = false
      setFeedLoading(false)
    }
  }

  /** A feed must never render blank: if the API failed or handed back an
   *  empty page, hydrate from the server-rendered breadth prop instead. */
  const ensureFeedNeverBlank = () => setFeedBeats(current => (current.length === 0 ? beats : current))

  // ---- Prompt 12/13: session persistence (sessionStorage, per user+mode,
  //  30 min). Each tab keeps its own session under its own key. --------------
  const sessionKeyFor = (mode: 'foryou' | 'following') => `prod4me-feed:${user.id}:${mode}`

  // restore once on mount (client only — no SSR access to sessionStorage):
  // saved sessions younger than 30 minutes replace the initial fetches
  useEffect(() => {
    const restoreOne = (mode: 'foryou' | 'following') => {
      try {
        const raw = sessionStorage.getItem(sessionKeyFor(mode))
        if (!raw) return null
        const parsed = JSON.parse(raw) as {
          beats?: ShapedBeat[]
          index?: number
          cursor?: string | null
          tag?: string | null
          savedAt?: number
        }
        if (parsed.beats?.length && parsed.savedAt && Date.now() - parsed.savedAt < 30 * 60 * 1000) {
          sessionsRef.current[mode] = {
            beats: parsed.beats,
            index: parsed.index ?? 0,
            cursor: parsed.cursor ?? null,
          }
          return parsed
        }
      } catch {
        // corrupt or unavailable storage — fall through to a fresh feed
      }
      return null
    }

    const restoredForYou = restoreOne('foryou')
    const restoredFollowing = restoreOne('following')
    if (restoredForYou) {
      setFeedBeats(restoredForYou.beats!)
      setIndex(restoredForYou.index ?? 0)
      setFeedCursor(restoredForYou.cursor ?? null)
      setFeedTag(restoredForYou.tag ?? null)
      skipFirstTagEffectRef.current = true
      return
    }
    void loadFeed(feedTag, 'replace', null, 'foryou').finally(ensureFeedNeverBlank)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // persist the active session under its per-mode key whenever it changes
  useEffect(() => {
    try {
      sessionStorage.setItem(
        sessionKeyFor(feedMode),
        JSON.stringify({
          beatIds: feedBeats.map(b => b.id),
          beats: feedBeats,
          index,
          cursor: feedCursor,
          tag: feedTag,
          savedAt: Date.now(),
        })
      )
    } catch {
      // storage full/unavailable — the feed still works, it just won't restore
    }
  }, [feedBeats, index, feedCursor, feedTag, feedMode])

  /** Prompt 12/13: tag feeds are separate sessions — the return tab's beats,
   *  index, and cursor are saved before switching and restored untouched
   *  when the tag clears (no reload). */
  useEffect(() => {
    if (skipFirstTagEffectRef.current) {
      // the mount effect above already restored or loaded the first page
      skipFirstTagEffectRef.current = false
      return
    }
    if (feedTag) {
      if (!returnFeedRef.current) {
        returnFeedRef.current = { beats: feedBeats, index, cursor: feedCursor }
      }
      void loadFeed(feedTag, 'replace').finally(ensureFeedNeverBlank)
    } else if (returnFeedRef.current) {
      const main = returnFeedRef.current
      returnFeedRef.current = null
      setFeedBeats(main.beats)
      setIndex(main.index)
      setFeedCursor(main.cursor)
    } else {
      void loadFeed(null, 'replace', null, feedMode).finally(ensureFeedNeverBlank)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedTag])

  // ---- Prompt 13: tab switching — per-tab sessions, pause the left tab's
  // audio (the Feed remounts with the other tab's beat), mark seen, prefetch
  const switchFeedMode = useCallback(
    (mode: 'foryou' | 'following') => {
      if (mode === feedMode) return
      // park the active session
      sessionsRef.current[feedMode] = { beats: feedBeats, index, cursor: feedCursor }
      setFeedMode(mode)
      if (mode === 'following') {
        void fetch('/api/feed/following/seen', { method: 'POST' }).catch(() => {})
        setHasNewFollowing(false)
      }
      const target = sessionsRef.current[mode]
      if (target.beats.length > 0) {
        setFeedBeats(target.beats)
        setIndex(target.index)
        setFeedCursor(target.cursor)
      } else {
        setFeedBeats([])
        setIndex(0)
        setFeedCursor(null)
        void loadFeed(null, 'replace', null, mode).finally(() => {})
      }
    },
    [feedMode, feedBeats, index, feedCursor]
  )

  // has-new dot: check on load and every 5 minutes while the feed is open
  useEffect(() => {
    if (view !== 'feed') return
    const checkHasNew = () => {
      void fetch('/api/feed/following/has-new', { cache: 'no-store' })
        .then(res => (res.ok ? res.json() : null))
        .then(data => setHasNewFollowing(Boolean(data?.hasNew)))
        .catch(() => {})
    }
    checkHasNew()
    const timer = window.setInterval(checkHasNew, 5 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [view])

  // Prompt 13: suggested producers for the Following tab's empty state —
  // this week's leaderboard top producers, falling back to the most streamed
  useEffect(() => {
    if (view !== 'feed' || feedMode !== 'following' || followedIds.length > 0) return
    const load = async () => {
      try {
        const res = await fetch('/api/feed/following/suggestions', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        setFollowingSuggestions(data.suggestions ?? [])
      } catch {
        // suggestions are best-effort
      }
    }
    void load()
  }, [view, feedMode, followedIds.length])

  // followed producer ids (drives the feed + badge and the Following tab)
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/follows', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        setFollowedIds(data.followedIds ?? [])
      } catch {
        // follow state is cosmetic until the next follow action
      }
    }
    void load()
  }, [])

  const beat = feedBeats[index] ?? null
  const beatId = beat?.id ?? ''

  const ownedForBeat = useMemo(
    () =>
      new Set(
        libraryState
          .filter(l => l.beat.id === beatId)
          .map(l => l.licenseType as 'NON_EXCLUSIVE' | 'EXCLUSIVE')
      ),
    [libraryState, beatId]
  )

  const myBeats = useMemo(
    () => beats.filter(b => b.producerId === user.id),
    [beats, user.id]
  )

  const toggleSave = () => {
    if (!beatId) return
    const isSaved = saved.includes(beatId)
    setSaved(v => (isSaved ? v.filter(i => i !== beatId) : [...v, beatId]))
    setSaveCounts(c => ({ ...c, [beatId]: (c[beatId] ?? 0) + (isSaved ? -1 : 1) }))
    // engagement: track only the positive action (saving), not un-saving
    if (!isSaved) trackEvent(beatId, 'SAVE', { feed: feedMode })
  }

  const toggleLike = () => {
    if (!beatId) return
    const isLiked = liked.includes(beatId)
    setLiked(v => (isLiked ? v.filter(i => i !== beatId) : [...v, beatId]))
    setLikeCounts(c => ({ ...c, [beatId]: (c[beatId] ?? 0) + (isLiked ? -1 : 1) }))
    if (!isLiked) {
      trackEvent(beatId, 'LIKE', { feed: feedMode })
    } else {
      // unlike: remove the LIKE event so the taste vector stops favoring it
      void fetch('/api/events', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beatId, type: 'LIKE' }),
      }).catch(() => {})
    }
  }

  const handleShare = () => {
    if (!beatId) return
    setShareCounts(c => ({ ...c, [beatId]: (c[beatId] ?? 0) + 1 }))
    // engagement: a share is a real signal — weight 3 (navigator share,
    // clipboard copy, and message shares all route through here)
    trackEvent(beatId, 'SHARE', { feed: feedMode })
  }

  const currentComments = [
    { name: 'Kai Rivers', avatar: 'KR', text: 'This one has such a clean pocket.' },
    { name: 'Nia Saint', avatar: 'NS', text: 'The texture on the drums is perfect.' },
    ...(addedComments[beatId] ?? []),
  ]
  const commentCount = (beat?.comments ?? 0) + (addedComments[beatId]?.length ?? 0)

  const roleLabel = isArtist ? 'Artist' : 'Producer'

  // badge = notifications unread (Prompt 8) + messages unread
  const inboxBadge = unread + messagesUnread

  // Engagement: STREAM vs SKIP. A beat visible for SKIP_UNDER_MILLIS (3s) of
  // watch time records one STREAM — with a timer at the 3-second mark, so a
  // stream still counts when the tab closes after watching. Leaving a beat
  // with less than 3s of visible watch time records the existing SKIP.
  // Each beat appearance yields STREAM or SKIP, never both. Hidden tabs
  // pause the watch clock and cancel the pending timer; returning resumes
  // the remaining time. Streams of a producer's own beats are not recorded
  // (client check; the server ignores them too). Anything shown in a
  // preview mode (none exists yet) must set watchingFeed false.
  const viewRef = useRef<{
    beatId: string
    isOwnBeat: boolean
    watchedMs: number
    sinceVisible: number | null
    streamStarted: boolean
    timer: ReturnType<typeof setTimeout> | null
  } | null>(null)

  const clearStreamTimer = () => {
    const current = viewRef.current
    if (current?.timer) {
      clearTimeout(current.timer)
      current.timer = null
    }
  }

  const isOwnBeatVisible = isProducer && beat?.producerId === user.id

  useEffect(() => {
    const watchingFeed = view === 'feed' && !profileUser && beatId.length > 0
    const current = viewRef.current

    if (watchingFeed) {
      if (!current || current.beatId !== beatId) {
        // the previous beat's view ends: close out the open visible stretch,
        // then it was a skip only if it never streamed and had less than 3s
        // of visible watch time
        if (current) {
          if (current.sinceVisible !== null) {
            current.watchedMs += Date.now() - current.sinceVisible
            current.sinceVisible = null
          }
          if (!current.streamStarted && current.watchedMs < SKIP_UNDER_MILLIS) {
            trackEvent(current.beatId, 'SKIP', { feed: feedMode })
          }
        }
        clearStreamTimer()

        const next = {
          beatId,
          isOwnBeat: isOwnBeatVisible,
          watchedMs: 0,
          sinceVisible: document.visibilityState === 'visible' ? Date.now() : null,
          streamStarted: false,
          timer: null as ReturnType<typeof setTimeout> | null,
        }
        viewRef.current = next
        if (!next.isOwnBeat && next.sinceVisible !== null) {
          next.timer = setTimeout(() => {
            next.streamStarted = true
            trackEvent(next.beatId, 'STREAM', { feed: feedMode })
          }, SKIP_UNDER_MILLIS)
        }
      }
    } else if (current) {
      // left the feed entirely
      if (current.sinceVisible !== null) {
        current.watchedMs += Date.now() - current.sinceVisible
        current.sinceVisible = null
      }
      if (!current.streamStarted && current.watchedMs < SKIP_UNDER_MILLIS) {
        trackEvent(current.beatId, 'SKIP', { feed: feedMode })
      }
      clearStreamTimer()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatId, view, profileUser, isOwnBeatVisible])

  // visibility: pause/resume the stream clock (watch time only accrues
  // while the tab is visible)
  useEffect(() => {
    const onVisibility = () => {
      const current = viewRef.current
      if (!current) return
      if (document.visibilityState === 'hidden') {
        if (current.sinceVisible !== null) {
          current.watchedMs += Date.now() - current.sinceVisible
          current.sinceVisible = null
        }
        clearStreamTimer()
      } else {
        current.sinceVisible = Date.now()
        if (!current.streamStarted && !current.isOwnBeat) {
          const remaining = Math.max(SKIP_UNDER_MILLIS - current.watchedMs, 0)
          current.timer = setTimeout(() => {
            current.streamStarted = true
            trackEvent(current.beatId, 'STREAM', { feed: feedMode })
          }, remaining)
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Prompt 12: navigation with a 600ms lock so one gesture (a single
  //  trackpad swipe fires many wheel events) moves exactly one beat --------
  const go = useCallback(
    (direction: 'next' | 'prev') => {
      const now = Date.now()
      if (now - navLockRef.current < 600) return
      navLockRef.current = now

      if (direction === 'next') {
        const next = index + 1
        // prefetch when crossing into the second-to-last loaded beat
        if (next >= feedBeats.length - 1 && feedCursor && !feedLoadingRef.current) {
          void loadFeed(feedTag, 'append', feedCursor, feedMode)
        }
        // index may run one past the end → the "all caught up" card
        setIndex(next)
      } else {
        setIndex(current => Math.max(current - 1, 0))
      }
    },
    [index, feedBeats.length, feedCursor, feedTag, feedMode]
  )

  // keyboard: ArrowDown / j next, ArrowUp / k prev — only while actually
  // viewing the feed, never while typing
  useEffect(() => {
    if (view !== 'feed' || profileUser || preview) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"]')) return
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        go('next')
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        go('prev')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, profileUser, preview, go])

  // ---- Prompt 12: refresh feed --------------------------------------------
  const showFeedToast = useCallback((message: string) => {
    setFeedToast(message)
    if (toastTimer.current) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setFeedToast(''), 4000)
  }, [])

  /** Prompt: unverified accounts browse freely but can't purchase — tapping
   *  Buy/Offer sends them to the verification screen (which has a link back). */
  const requireVerificationToPurchase = () => {
    if (user.emailVerified !== false) return false
    showFeedToast('Verify your email to purchase')
    router.push('/verify-pending')
    return true
  }

  const refreshFeed = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      const params = new URLSearchParams()
      if (feedCursor && feedMode === 'foryou') params.set('cursor', feedCursor)
      if (feedMode === 'foryou') params.set('refresh', '1')
      const res = await fetch(`/api/feed?${params.toString()}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Refresh failed')
      setFeedBeats(data.beats ?? [])
      setIndex(0)
      setFeedCursor(data.nextCursor ?? null)
      if (data.caughtUp) {
        showFeedToast("You've seen everything new. Showing popular beats again.")
      }
    } catch {
      showFeedToast("Couldn't refresh. Try again.")
    } finally {
      setRefreshing(false)
    }
  }, [feedCursor, feedMode, refreshing, showFeedToast])

  /** Prompt 13: optimistic follow toggle (rollback on failure). */
  const toggleFollow = useCallback(
    async (targetId: string) => {
      const isFollowing = followedIds.includes(targetId)
      setFollowedIds(current =>
        isFollowing ? current.filter(id => id !== targetId) : [...current, targetId]
      )
      try {
        const res = await fetch(`/api/follows/${targetId}`, {
          method: isFollowing ? 'DELETE' : 'POST',
        })
        if (!res.ok) throw new Error()
      } catch {
        setFollowedIds(current =>
          isFollowing ? [...current, targetId] : current.filter(id => id !== targetId)
        )
        showFeedToast('Follow failed. Try again.')
      }
    },
    [followedIds, showFeedToast]
  )

  return (
    <main
      className="min-h-screen bg-background text-foreground"
      style={
        {
          '--profile-accent': theme.accent,
          '--profile-bg': theme.bg,
          '--profile-text': theme.text,
        } as React.CSSProperties
      }
    >
      <div className="mx-auto flex min-h-screen max-w-[1500px]">
        <Sidebar
          view={view}
          setView={setView}
          isArtist={isArtist}
          userName={user.name}
          userRole={user.role}
          onSignOut={() => {
            try {
              for (const mode of ['foryou', 'following'] as const) {
                sessionStorage.removeItem(`prod4me-feed:${user.id}:${mode}`)
              }
              sessionStorage.removeItem(`prod4me-feed:${user.id}`)
            } catch {
              // storage unavailable — sign out anyway
            }
            signOut({ callbackUrl: '/login' })
          }}
          isAdmin={isAdmin}
          unread={inboxBadge}
        />

        <section className="relative flex min-h-screen min-w-0 flex-1 flex-col">
          <Header
            onSelectUser={(u: SearchedUser) => {
              void openProfile(u.username)
            }}
            view={view}
            roleLabel={roleLabel}
            onOpenSettings={() => setView('settings')}
          />

          {profileUser ? (
            <UserProfile
              user={profileUser}
              following={Boolean(profileUser.isFollowing)}
              beats={profileBeats}
              onOpenBeat={beatId => void openBeat(beatId)}
              onFollow={async () => {
                // Prompt 13: real follows — optimistic toggle; the profile
                // refreshes its own state on failure
                const isFollowing = profileUser.isFollowing
                try {
                  const res = await fetch(`/api/follows/${profileUser.id}`, {
                    method: isFollowing ? 'DELETE' : 'POST',
                  })
                  if (!res.ok) throw new Error()
                  setFollowedIds(current =>
                    isFollowing
                      ? current.filter(id => id !== profileUser.id)
                      : [...current, profileUser.id]
                  )
                  setProfileUser({
                    ...profileUser,
                    isFollowing: !isFollowing,
                    followerCount: Math.max(
                      0,
                      (profileUser.followerCount ?? 0) + (isFollowing ? -1 : 1)
                    ),
                  })
                } catch {
                  showFeedToast('Follow failed. Try again.')
                }
              }}
              onMessage={async () => {
                const res = await fetch('/api/conversations', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userId: profileUser.id }),
                })
                const data = await res.json()
                if (!res.ok) return
                setOpenConversation({ id: data.conversation.id, other: data.conversation.other })
                setProfileUser(null)
                setInboxTab('messages')
                setView('dashboard')
              }}
              onBack={() => setProfileUser(null)}
              onOpenFollowList={list => setFollowList({ username: profileUser.username, list })}
            />
          ) : view === 'leaderboard' ? (
            <LeaderboardView
              isProducer={isProducer}
              onOpenBeat={beatId => {
                setView('feed')
                const index = feedBeats.findIndex(b => b.id === beatId)
                if (index >= 0) {
                  setIndex(index)
                  setProfileUser(null)
                }
              }}
              onOpenProducer={producerId => {
                const producer = producers.find(p => p.id === producerId)
                if (producer) void openProfile(producer.username)
              }}
            />
          ) : view === 'settings' ? (
            <SettingsView onClose={() => setView('feed')} focusSection={settingsFocus} />
          ) : view === 'dashboard' ? (
            isProducer ? (
              // consolidated producer dashboard: offers + beats + inbox on one page
              <div className="min-w-0 flex-1">
                <Dashboard
                  userName={user.name}
                  beats={myBeats}
                  openOffers={openOffers}
                  playlists={playlists}
                  onEditPrice={b => setEditPriceBeat(b)}
                />
                <div className="mx-auto w-full max-w-5xl px-5 pb-28 md:px-12">
                  <InboxView
                    tab={inboxTab}
                    setTab={setInboxTab}
                    notifications={notifications}
                    notificationsLoading={notificationsLoading}
                    unread={unread}
                    onMarkSeen={markNotificationsSeen}
                    onOpenNotification={openNotification}
                    meId={user.id}
                    onOpenBeat={beatId => void openBeat(beatId)}
                    onOpenProfile={username => void openProfile(username)}
                    openConversation={openConversation}
                    onOpenedConversation={() => setOpenConversation(null)}
                    onMessagesUnreadChange={setMessagesUnread}
                    messagesUnread={messagesUnread}
                  />
                </div>
              </div>
            ) : (
              // artists have no dashboard — this view is their inbox
              // (notifications + messages); offers live on their profile
              <InboxView
                tab={inboxTab}
                setTab={setInboxTab}
                notifications={notifications}
                notificationsLoading={notificationsLoading}
                unread={unread}
                onMarkSeen={markNotificationsSeen}
                onOpenNotification={openNotification}
                meId={user.id}
                onOpenBeat={beatId => void openBeat(beatId)}
                onOpenProfile={username => void openProfile(username)}
                openConversation={openConversation}
                onOpenedConversation={() => setOpenConversation(null)}
                onMessagesUnreadChange={setMessagesUnread}
                messagesUnread={messagesUnread}
              />
            )
          ) : (
            view === 'feed' &&
              (beat ? (
                <Feed
                  beat={beat}
                  tag={feedTag}
                  onTag={handleFeedTagTap}
                  onClear={clearFeedTag}
                  saved={saved.includes(beatId)}
                  onSave={toggleSave}
                  saveCount={saveCounts[beatId] ?? 0}
                  liked={liked.includes(beatId)}
                  onLike={toggleLike}
                  likeCount={likeCounts[beatId] ?? 0}
                  commentCount={commentCount}
                  onComment={() => setCommentsOpen(true)}
                  shareCount={shareCounts[beatId] ?? 0}
                  onShare={handleShare}
                  onShareMessage={() => setShareBeat(beat)}
                  onOffer={() => {
                    if (requireVerificationToPurchase()) return
                    setPurchase({ mode: 'offer' })
                  }}
                  onBuy={() => {
                    if (requireVerificationToPurchase()) return
                    setPurchase({ mode: 'buy' })
                  }}
                  isArtist={isArtist}
                  owned={[...ownedForBeat]}
                  onPoster={posterUser => {
                    // resolve the real producer row so the profile shows true
                    // data from the API — fall back to nothing if unknown
                    const real = producers.find(p => p.id === posterUser.producerId)
                    if (real) void openProfile(real.username)
                  }}
                  onNext={() => go('next')}
                  onPrev={() => go('prev')}
                  onRefresh={() => void refreshFeed()}
                  refreshing={refreshing}
                  canPullToRefresh={index === 0 && !feedTag}
                  feedMode={feedMode}
                  onModeChange={mode => switchFeedMode(mode)}
                  hasNewFollowing={hasNewFollowing}
                  followedProducerIds={followedIds}
                  onFollowProducer={producerId => void toggleFollow(producerId)}
                  isOwnBeat={beat.producerId === user.id}
                  isNewBeat={Boolean(beat.isNew)}
                />
              ) : feedBeats.length > 0 && index >= feedBeats.length ? (
                // Prompt 12: end of the session — no wrapping, just the card
                <div className="mx-auto w-full max-w-md flex-1 px-5 pb-28 pt-24 text-center">
                  <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-surface-2 text-brand">
                    <CheckCircle2 size={26} />
                  </div>
                  <h2 className="mt-5 text-2xl font-black">You&apos;re all caught up</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {feedLoading
                      ? 'Loading more beats…'
                      : feedMode === 'following'
                        ? 'You have seen every new beat from the people you follow.'
                        : 'You have seen every beat in this feed session.'}
                  </p>
                  {feedMode === 'following' ? (
                    <button
                      onClick={() => switchFeedMode('foryou')}
                      className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-xs font-black text-brand-foreground"
                    >
                      Go to For You
                    </button>
                  ) : (
                    <button
                      onClick={() => void refreshFeed()}
                      disabled={refreshing}
                      className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-xs font-black text-brand-foreground disabled:opacity-60"
                    >
                      <RotateCw size={13} className={refreshing ? 'animate-spin' : ''} />
                      {refreshing ? 'Refreshing…' : 'Refresh feed'}
                    </button>
                  )}
                </div>
              ) : feedMode === 'following' && !feedTag ? (
                // Prompt 13: Following tab empty states
                followedIds.length === 0 ? (
                  <div className="mx-auto w-full max-w-2xl flex-1 px-5 pb-28 pt-24 text-center">
                    <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-surface-2 text-brand">
                      <UserRoundPlus size={26} />
                    </div>
                    <h2 className="mt-5 text-2xl font-black">Follow producers to see their new beats here</h2>
                    {followingSuggestions.length > 0 && (
                      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {followingSuggestions.map(suggestion => (
                          <div
                            key={suggestion.id}
                            className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-4"
                          >
                            <Avatar text={suggestion.name} src={suggestion.avatarUrl} size="size-14" />
                            <div>
                              <p className="truncate text-sm font-black">{suggestion.name}</p>
                              <p className="text-xs text-muted-foreground">@{suggestion.username}</p>
                            </div>
                            {suggestion.coverUrl && (
                              <img
                                src={suggestion.coverUrl}
                                alt=""
                                className="h-16 w-full rounded-lg object-cover"
                              />
                            )}
                            <button
                              onClick={() => void toggleFollow(suggestion.id)}
                              className={`w-full rounded-xl py-2 text-xs font-black ${
                                followedIds.includes(suggestion.id)
                                  ? 'bg-surface-2 text-foreground'
                                  : 'bg-brand text-brand-foreground'
                              }`}
                            >
                              {followedIds.includes(suggestion.id) ? 'Following' : 'Follow'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {followedIds.length > 0 && (
                      <button
                        onClick={() => switchFeedMode('foryou')}
                        className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-xs font-black text-brand-foreground"
                      >
                        See their beats
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="mx-auto w-full max-w-md flex-1 px-5 pb-28 pt-24 text-center">
                    <h2 className="text-2xl font-black">No new beats from people you follow yet</h2>
                    <button
                      onClick={() => switchFeedMode('foryou')}
                      className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-xs font-black text-brand-foreground"
                    >
                      Go to For You
                    </button>
                  </div>
                )
              ) : feedLoading ? (
                <div className="mx-auto w-full max-w-md flex-1 px-5 pb-28 pt-24 text-center">
                  <h2 className="text-2xl font-black">Loading your feed…</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Personalizing your Discover page.
                  </p>
                </div>
              ) : (
                <div className="mx-auto w-full max-w-md flex-1 px-5 pb-28 pt-24 text-center">
                  <h2 className="text-2xl font-black">No beats yet</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {isArtist
                      ? 'Producers haven’t uploaded any beats yet. Check back soon.'
                      : 'Upload your first beat from the Upload tab to see it here.'}
                  </p>
                </div>
              ))
          )}

          {view === 'upload' && <UploadView />}
          {view === 'profile' &&
            (isArtist ? (
              <ArtistProfile
                tracks={tracks}
                saved={saved}
                beats={beats}
                library={libraryState}
                onPost={() => setPostOpen(true)}
                onEdit={() => setEdit(true)}
                banner={banner}
                theme={theme}
                bio={bio}
                userName={user.name}
                avatarText={avatarText}
                avatarUrl={user.avatar ?? null}
              />
            ) : (
              <ProducerProfile
                onEdit={() => setEdit(true)}
                banner={banner}
                theme={theme}
                bio={bio}
                userName={user.name}
                avatarText={avatarText}
                avatarUrl={user.avatar ?? null}
                beats={myBeats}
                playlists={playlists}
                followerCount={user.followerCount ?? 0}
                followingCount={user.followingCount ?? 0}
                onOpenBeat={beatId => {
                  const index = myBeats.findIndex(b => b.id === beatId)
                  if (index >= 0) setPreview({ beats: myBeats, startIndex: index })
                  else void openBeat(beatId)
                }}
                onUpload={() => setView('upload')}
              />
            ))}

          {purchase && beat && (
            <PurchaseModal
              beat={beat}
              mode={purchase.mode}
              owned={[...ownedForBeat]}
              onClose={() => setPurchase(null)}
              onObtained={licenseType => {
                setLibraryState(prev => [
                  ...prev,
                  {
                    id: `local-${beat.id}-${licenseType}`,
                    licenseType,
                    pricePaidCents: 0,
                    createdAt: new Date().toISOString(),
                    beat: {
                      id: beat.id,
                      title: beat.title,
                      price: beat.price,
                      exclusivePriceCents: beat.exclusivePriceCents,
                      exclusiveSold: beat.exclusiveSold,
                      producer: beat.producer,
                      artUrl: beat.artUrl,
                      artPreset: beat.artPreset,
                    },
                  },
                ])
                router.refresh()
              }}
            />
          )}

          {editPriceBeat && (
            <PriceEditor
              beat={editPriceBeat}
              onClose={() => setEditPriceBeat(null)}
              onSaved={() => {
                setEditPriceBeat(null)
                router.refresh()
              }}
            />
          )}

          {commentsOpen && beat && (
            <Comments
              beat={beat}
              comments={currentComments}
              draft={commentDraft}
              setDraft={setCommentDraft}
              onPost={() => {
                if (commentDraft.trim()) {
                  trackEvent(beatId, 'COMMENT', { feed: feedMode })
                  setAddedComments(prev => ({
                    ...prev,
                    [beatId]: [
                      ...(prev[beatId] ?? []),
                      { name: user.name, avatar: avatarText, text: commentDraft.trim() },
                    ],
                  }))
                  setCommentDraft('')
                }
              }}
              onClose={() => setCommentsOpen(false)}
            />
          )}

          {postOpen && (
            <PostTrack
              saved={saved}
              beats={beats}
              onClose={() => setPostOpen(false)}
              onPublish={(track: any) => {
                setTracks(v => [...v, track])
                setPostOpen(false)
              }}
            />
          )}

          {edit && (
            <EditProfile
              theme={theme}
              setTheme={setTheme}
              banner={banner}
              setBanner={setBanner}
              bio={bio}
              setBio={setBio}
              avatar={user.avatar ?? null}
              setAvatar={setAvatar}
              onClose={() => {
                setEdit(false)
                router.refresh()
              }}
            />
          )}

          {shareBeat && (
            <ShareBeatModal
              beat={shareBeat}
              onClose={() => setShareBeat(null)}
              onSent={() => handleShare()}
            />
          )}

          {preview && (
            <PreviewOverlay
              beats={preview.beats}
              startIndex={preview.startIndex}
              onClose={() => setPreview(null)}
              onEditPrice={b => setEditPriceBeat(b)}
            />
          )}

          {followList && (
            <FollowListModal
              username={followList.username}
              list={followList.list}
              onClose={() => setFollowList(null)}
              onOpenProfile={username => {
                setFollowList(null)
                void openProfile(username)
              }}
            />
          )}
        </section>
      </div>

      <MobileNav view={view} setView={setView} isArtist={isArtist} unread={inboxBadge} />

      {/* Prompt 12: feed toast (refresh failure / caught-up notice) */}
      {feedToast && (
        <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 lg:bottom-6">
          <p className="rounded-full border border-border bg-surface px-4 py-2.5 text-xs font-black text-foreground shadow-lg">
            {feedToast}
          </p>
        </div>
      )}
    </main>
  )
}
