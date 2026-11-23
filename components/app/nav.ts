import { Home, Plus, BarChart3, UserRound, Trophy } from 'lucide-react'

export type View = 'feed' | 'upload' | 'dashboard' | 'profile' | 'leaderboard' | 'settings'

export function getNav(isArtist: boolean) {
  return isArtist
    ? ([
        ['feed', Home, 'Discover'],
        ['leaderboard', Trophy, 'Leaderboard'],
        ['dashboard', BarChart3, 'Dashboard'],
        ['profile', UserRound, 'Artist profile'],
      ] as const)
    : ([
        ['feed', Home, 'Discover'],
        ['leaderboard', Trophy, 'Leaderboard'],
        ['upload', Plus, 'Upload beat'],
        ['dashboard', BarChart3, 'Dashboard'],
        ['profile', UserRound, 'Profile'],
      ] as const)
}
