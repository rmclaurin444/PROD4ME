import { Home, Plus, BarChart3, Inbox, UserRound, Trophy } from 'lucide-react'

export type View = 'feed' | 'upload' | 'dashboard' | 'inbox' | 'profile' | 'leaderboard'

export function getNav(isArtist: boolean) {
  return isArtist
    ? ([
        ['feed', Home, 'Discover'],
        ['leaderboard', Trophy, 'Leaderboard'],
        ['inbox', Inbox, 'Inbox'],
        ['profile', UserRound, 'Artist profile'],
      ] as const)
    : ([
        ['feed', Home, 'Discover'],
        ['leaderboard', Trophy, 'Leaderboard'],
        ['upload', Plus, 'Upload beat'],
        ['dashboard', BarChart3, 'Dashboard'],
        ['inbox', Inbox, 'Inbox'],
        ['profile', UserRound, 'Profile'],
      ] as const)
}
