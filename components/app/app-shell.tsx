'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  BarChart3,
  Bookmark,
  Inbox as InboxIcon,
  Link2,
  MessageCircle,
  UserRound,
  Zap,
} from 'lucide-react'
import { Sidebar, MobileNav } from '@/components/app/sidebar'
import { Header } from '@/components/app/header'
import { Feed } from '@/components/app/feed'
import { UploadView } from '@/components/app/upload'
import { Dashboard } from '@/components/app/dashboard'
import { ProducerProfile, ArtistProfile } from '@/components/app/profiles'
import { InboxView, UserProfile } from '@/components/app/inbox'
import { Comments, PostTrack } from '@/components/app/modals'
import { PurchaseModal, type PurchaseMode } from '@/components/app/purchase-modal'
import { PriceEditor } from '@/components/app/price-editor'
import { EditProfile } from '@/components/app/edit-profile'
import { themes, getInitials } from '@/components/app/data'
import type { ShapedBeat } from '@/lib/beats'
import type { ShapedLicense } from '@/lib/offers'
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
}

export function AppShell({
  user,
  beats,
  library,
  openOffers,
  producers,
  devPanel,
}: {
  user: SessionUser
  beats: ShapedBeat[]
  library: ShapedLicense[]
  openOffers: number
  producers: { id: string; name: string; avatar: string | null; bio: string | null }[]
  /** Dev-only: shows the /dev panel link in the sidebar. */
  devPanel?: boolean
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
  const [feedBeats, setFeedBeats] = useState<ShapedBeat[]>([])
  const [feedCursor, setFeedCursor] = useState<string | null>(null)
  const [feedTag, setFeedTag] = useState<string | null>(null)
  const [feedLoading, setFeedLoading] = useState(false)
  const feedLoadingRef = useRef(false)
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
  const [tag, setTag] = useState<string | null>(null)
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
  const [search, setSearch] = useState('')
  const [profileUser, setProfileUser] = useState<any>(null)
  const [followed, setFollowed] = useState<string[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({
    'Melo K': 12400,
    'Nia Saint': 8900,
    'Juno Grey': 7300,
    'Trey Two': 6100,
  })
  const [tracks, setTracks] = useState<
    { title: string; url: string; beat: string; art: string | null }[]
  >([])
  const [postOpen, setPostOpen] = useState(false)
  const [inboxTab, setInboxTab] = useState<'offers' | 'notifications' | 'messages'>('offers')
  const [offersKey, setOffersKey] = useState(0)
  const [unread, setUnread] = useState(3)
  const [activeConversation, setActiveConversation] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([
    { name: 'Melo K', avatar: 'MK', preview: 'That hook is sounding crazy.', time: '2m', unread: 2, history: [{ text: 'That hook is sounding crazy.', sender: 'them', timestamp: '2m' }, { text: "Can't wait. I'll send it over soon.", sender: 'me', timestamp: '1m' }] },
    { name: 'Nia Saint', avatar: 'NS', preview: 'Would love to hear what you make.', time: '1h', unread: 0, history: [{ text: 'Would love to hear what you make.', sender: 'them', timestamp: '1h' }] },
    { name: 'Juno Grey', avatar: 'JG', preview: 'Offer accepted — sending stems now.', time: '3h', unread: 1, history: [{ text: 'Offer accepted — sending stems now.', sender: 'them', timestamp: '3h' }] },
  ])

  useEffect(() => {
    // re-sync the library when the server sends refreshed props (post license grant)
    setLibraryState(library)
  }, [library])

  useEffect(() => {
    // remount the offers inbox when it opens so expired offers are re-fetched
    if (view === 'inbox' && inboxTab === 'offers') setOffersKey(k => k + 1)
  }, [view, inboxTab])

  // ---- personalized feed loading (server: lib/recommendations/*) -----------
  const loadFeed = async (
    tag: string | null,
    mode: 'replace' | 'append',
    cursor: string | null = null,
  ) => {
    if (feedLoadingRef.current) return
    feedLoadingRef.current = true
    setFeedLoading(true)
    try {
      const params = new URLSearchParams()
      if (tag) params.set('tag', tag)
      if (cursor) params.set('cursor', cursor)
      const res = await fetch(`/api/feed${params.size > 0 ? `?${params.toString()}` : ''}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Feed failed')
      const page: ShapedBeat[] = data.beats ?? []
      const nextCursor: string | null = data.nextCursor ?? null

      if (mode === 'replace') {
        setFeedBeats(page)
        setIndex(0)
      } else {
        // append, deduping against anything already on the client
        setFeedBeats(current => {
          const known = new Set(current.map(beat => beat.id))
          const fresh = page.filter(beat => !known.has(beat.id))
          return [...current, ...fresh]
        })
      }
      setFeedCursor(nextCursor)
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

  useEffect(() => {
    void loadFeed(feedTag, 'replace').finally(ensureFeedNeverBlank)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedTag])

  const handleFeedTagTap = (tagName: string) => {
    setFeedTag(tagName === feedTag ? null : tagName)
  }

  const clearFeedTag = () => setFeedTag(null)

  const notifications = [
    { icon: Bookmark, text: 'Your beat NIGHTSHIFT was saved by Kai Rivers.', time: '2m', fresh: true },
    { icon: UserRound, text: 'Nia Saint started following you.', time: '18m', fresh: true },
    { icon: MessageCircle, text: 'Melo K commented on your track Midnight in Atlanta.', time: '1h', fresh: true },
    { icon: Zap, text: 'Your offer for VELVET ROOM was accepted.', time: '3h', fresh: false },
    { icon: Link2, text: 'Avery Lane posted a track made with your beat.', time: 'Yesterday', fresh: false },
  ]

  const users = producers.map(p => ({
    id: p.id,
    name: p.name,
    role: 'Producer',
    avatar: p.avatar ?? getInitials(p.name),
    bio: p.bio ?? '',
  }))

  const matches = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()))
  const beat = feedBeats.length > 0 ? feedBeats[index % feedBeats.length] : null
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
    if (!isSaved) trackEvent(beatId, 'SAVE')
  }

  const toggleLike = () => {
    if (!beatId) return
    const isLiked = liked.includes(beatId)
    setLiked(v => (isLiked ? v.filter(i => i !== beatId) : [...v, beatId]))
    setLikeCounts(c => ({ ...c, [beatId]: (c[beatId] ?? 0) + (isLiked ? -1 : 1) }))
    // engagement: track only the positive action (liking), not un-liking
    if (!isLiked) trackEvent(beatId, 'LIKE')
  }

  const handleShare = () => {
    if (!beatId) return
    setShareCounts(c => ({ ...c, [beatId]: (c[beatId] ?? 0) + 1 }))
  }

  const currentComments = [
    { name: 'Kai Rivers', avatar: 'KR', text: 'This one has such a clean pocket.' },
    { name: 'Nia Saint', avatar: 'NS', text: 'The texture on the drums is perfect.' },
    ...(addedComments[beatId] ?? []),
  ]
  const commentCount = (beat?.comments ?? 0) + (addedComments[beatId]?.length ?? 0)

  const roleLabel = isArtist ? 'Artist' : 'Producer'

  // Engagement: SKIP detection — when the visible beat changes (or the user
  // leaves the feed entirely) and the outgoing beat was seen for less than
  // SKIP_UNDER_MILLIS, log one SKIP for that beat view. At most one SKIP per
  // beat view, and only when actually viewing the feed (not a profile, etc).
  const viewStartedRef = useRef<{ beatId: string; at: number } | null>(null)

  useEffect(() => {
    const watchingFeed = view === 'feed' && !profileUser && beatId.length > 0
    const started = viewStartedRef.current

    if (watchingFeed) {
      if (!started || started.beatId !== beatId) {
        if (started) {
          const elapsed = Date.now() - started.at
          if (elapsed < SKIP_UNDER_MILLIS) trackEvent(started.beatId, 'SKIP')
        }
        viewStartedRef.current = { beatId, at: Date.now() }
      }
    } else if (started) {
      const elapsed = Date.now() - started.at
      if (elapsed < SKIP_UNDER_MILLIS) trackEvent(started.beatId, 'SKIP')
      viewStartedRef.current = null
    }
  }, [beatId, view, profileUser])

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
          onSignOut={() => signOut({ callbackUrl: '/login' })}
          devPanel={devPanel}
        />

        <section className="relative flex min-h-screen min-w-0 flex-1 flex-col">
          <Header
            search={search}
            setSearch={setSearch}
            matches={matches}
            onSelectUser={u => {
              setProfileUser(u)
              setSearch('')
            }}
            view={view}
            roleLabel={roleLabel}
          />

          {profileUser ? (
            <UserProfile
              user={profileUser}
              count={counts[profileUser.name] ?? 0}
              following={followed.includes(profileUser.name)}
              beats={
                profileUser.id
                  ? beats.filter(b => b.producerId === profileUser.id)
                  : []
              }
              onFollow={() => {
                const isFollowing = followed.includes(profileUser.name)
                setFollowed(isFollowing ? followed.filter(n => n !== profileUser.name) : [...followed, profileUser.name])
                setCounts({ ...counts, [profileUser.name]: (counts[profileUser.name] ?? 0) + (isFollowing ? -1 : 1) })
              }}
              onMessage={() => {
                const existing = messages.findIndex((m: any) => m.name === profileUser.name)
                if (existing >= 0) {
                  setActiveConversation(existing)
                } else {
                  setMessages([
                    ...messages,
                    { name: profileUser.name, avatar: profileUser.avatar, preview: 'New conversation', time: 'now', unread: 0, history: [] },
                  ])
                  setActiveConversation(messages.length)
                }
                setInboxTab('messages')
                setProfileUser(null)
                setView('inbox')
              }}
              onBack={() => setProfileUser(null)}
            />
          ) : view === 'inbox' ? (
            <InboxView
              tab={inboxTab}
              setTab={setInboxTab}
              notifications={notifications}
              unread={unread}
              setUnread={setUnread}
              messages={messages}
              activeConversation={activeConversation}
              setActiveConversation={setActiveConversation}
              message={message}
              setMessage={setMessage}
              setMessages={setMessages}
              role={user.role}
              refreshKey={offersKey}
            />
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
                  onOffer={() => setPurchase({ mode: 'offer' })}
                  onBuy={() => setPurchase({ mode: 'buy' })}
                  isArtist={isArtist}
                  owned={[...ownedForBeat]}
                  onPoster={posterUser => {
                    // resolve the real producer row so the profile shows true
                    // bio/avatar/ID — fall back to whatever the feed sent
                    const real = producers.find(p => p.id === posterUser.producerId)
                    setProfileUser(
                      real
                        ? {
                            id: real.id,
                            name: real.name,
                            role: 'Producer',
                            avatar: real.avatar ?? getInitials(real.name),
                            bio: real.bio ?? '',
                          }
                        : posterUser
                    )
                  }}
                  onNext={() => {
                    const next = index + 1
                    // prefetch the next page when crossing into the last beat
                    if (next >= feedBeats.length - 1 && feedCursor && !feedLoading) {
                      void loadFeed(feedTag, 'append', feedCursor)
                    }
                    setIndex(next)
                  }}
                />
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
          {view === 'dashboard' && isProducer && (
            <Dashboard
              userName={user.name}
              beats={myBeats}
              openOffers={openOffers}
              onEditPrice={b => setEditPriceBeat(b)}
            />
          )}
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
              />
            ) : (
              <ProducerProfile
                onEdit={() => setEdit(true)}
                banner={banner}
                theme={theme}
                bio={bio}
                userName={user.name}
                avatarText={avatarText}
                beats={myBeats}
                onEditPrice={b => setEditPriceBeat(b)}
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
                  trackEvent(beatId, 'COMMENT')
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
              avatar={avatarText}
              onClose={() => setEdit(false)}
            />
          )}
        </section>
      </div>

      <MobileNav view={view} setView={setView} isArtist={isArtist} />
    </main>
  )
}
