import { Home, Plus, BarChart3, UserRound, Trophy, Inbox } from 'lucide-react'

export type View = 'feed' | 'upload' | 'dashboard' | 'profile' | 'leaderboard' | 'settings'

export function getNav(isArtist: boolean) {
  return isArtist
    ? ([
        ['feed', Home, 'Discover'],
        ['leaderboard', Trophy, 'Leaderboard'],
        // artists have no dashboard — their 'dashboard' view is the inbox
        // (notifications + messages); the unread badge lands here
        ['dashboard', Inbox, 'Inbox'],
        ['profile', UserRound, 'Artist profile'],
      ] as const)
    : ([
        ['feed', Home, 'Discover'],
        ['leaderboard', Trophy, 'Leaderboard'],
        ['upload', Plus, 'Upload beat'],
        // the producer dashboard page carries the inbox below the dashboard
        // content, so its nav item wears the unread badge
        ['dashboard', BarChart3, 'Dashboard'],
        ['profile', UserRound, 'Profile'],
      ] as const)
}
