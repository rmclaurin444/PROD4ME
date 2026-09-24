'use client'

import { useState } from 'react'
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
import { Comments, PostTrack, Offer } from '@/components/app/modals'
import { EditProfile } from '@/components/app/edit-profile'
import { themes, getInitials } from '@/components/app/data'
import type { ShapedBeat } from '@/lib/beats'
import type { View } from '@/components/app/nav'

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

export function AppShell({ user, beats }: { user: SessionUser; beats: ShapedBeat[] }) {
  const isArtist = user.role === 'ARTIST'
  const avatarText = getInitials(user.name)

  const initialTheme = themes.find(t => t.id === user.theme) ?? themes[0]

  const [view, setView] = useState<View>('feed')
  const [index, setIndex] = useState(0)
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
  const [offer, setOffer] = useState(false)
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
  const [inboxTab, setInboxTab] = useState<'notifications' | 'messages'>('notifications')
  const [unread, setUnread] = useState(3)
  const [activeConversation, setActiveConversation] = useState<number | null>(null)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([
    { name: 'Melo K', avatar: 'MK', preview: 'That hook is sounding crazy.', time: '2m', unread: 2, history: [{ text: 'That hook is sounding crazy.', sender: 'them', timestamp: '2m' }, { text: "Can't wait. I'll send it over soon.", sender: 'me', timestamp: '1m' }] },
    { name: 'Nia Saint', avatar: 'NS', preview: 'Would love to hear what you make.', time: '1h', unread: 0, history: [{ text: 'Would love to hear what you make.', sender: 'them', timestamp: '1h' }] },
    { name: 'Juno Grey', avatar: 'JG', preview: 'Offer accepted — sending stems now.', time: '3h', unread: 1, history: [{ text: 'Offer accepted — sending stems now.', sender: 'them', timestamp: '3h' }] },
  ])

  const notifications = [
    { icon: Bookmark, text: 'Your beat NIGHTSHIFT was saved by Kai Rivers.', time: '2m', fresh: true },
    { icon: UserRound, text: 'Nia Saint started following you.', time: '18m', fresh: true },
    { icon: MessageCircle, text: 'Melo K commented on your track Midnight in Atlanta.', time: '1h', fresh: true },
    { icon: Zap, text: 'Your offer for VELVET ROOM was accepted.', time: '3h', fresh: false },
    { icon: Link2, text: 'Avery Lane posted a track made with your beat.', time: 'Yesterday', fresh: false },
  ]

  const users = [
    { name: 'Melo K', role: 'Producer', avatar: 'MK', bio: 'Dark drums and cinematic textures.' },
    { name: 'Nia Saint', role: 'Producer', avatar: 'NS', bio: 'Melodic worlds for late nights.' },
    { name: 'Juno Grey', role: 'Producer', avatar: 'JG', bio: 'Dusty loops and warm samples.' },
    { name: 'Trey Two', role: 'Producer', avatar: 'TT', bio: '808s with a point of view.' },
  ]

  const matches = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()))
  const filtered = tag ? beats.filter(b => b.tags.includes(tag)) : beats
  const beat = filtered.length > 0 ? filtered[index % filtered.length] : null
  const beatId = beat?.id ?? ''
  const toggleSave = () => {
    if (!beatId) return
    const isSaved = saved.includes(beatId)
    setSaved(v => (isSaved ? v.filter(i => i !== beatId) : [...v, beatId]))
    setSaveCounts(c => ({ ...c, [beatId]: (c[beatId] ?? 0) + (isSaved ? -1 : 1) }))
  }

  const toggleLike = () => {
    if (!beatId) return
    const isLiked = liked.includes(beatId)
    setLiked(v => (isLiked ? v.filter(i => i !== beatId) : [...v, beatId]))
    setLikeCounts(c => ({ ...c, [beatId]: (c[beatId] ?? 0) + (isLiked ? -1 : 1) }))
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
            />
          ) : (
            view === 'feed' &&
              (beat ? (
                <Feed
                  beat={beat}
                  tag={tag}
                  onTag={setTag}
                  onClear={() => setTag(null)}
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
                  onOffer={() => setOffer(true)}
                  onNext={() => setIndex(v => v + 1)}
                  isArtist={isArtist}
                  onPoster={u => setProfileUser(users.find(x => x.name === u.name) ?? u)}
                />
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
          {view === 'dashboard' && <Dashboard userName={user.name} />}
          {view === 'profile' &&
            (isArtist ? (
              <ArtistProfile
                tracks={tracks}
                saved={saved}
                beats={beats}
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
              />
            ))}

          {offer && beat && <Offer onClose={() => setOffer(false)} beat={beat} />}

          {commentsOpen && beat && (
            <Comments
              beat={beat}
              comments={currentComments}
              draft={commentDraft}
              setDraft={setCommentDraft}
              onPost={() => {
                if (commentDraft.trim()) {
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
