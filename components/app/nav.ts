import { Home, Plus, BarChart3, Inbox, UserRound } from 'lucide-react'

export type View = 'feed' | 'upload' | 'dashboard' | 'inbox' | 'profile'

export function getNav(isArtist: boolean) {
  return isArtist
    ? ([
        ['feed', Home, 'Discover'],
        ['inbox', Inbox, 'Inbox'],
        ['profile', UserRound, 'Artist profile'],
      ] as const)
    : ([
        ['feed', Home, 'Discover'],
        ['upload', Plus, 'Upload beat'],
        ['dashboard', BarChart3, 'Dashboard'],
        ['inbox', Inbox, 'Inbox'],
        ['profile', UserRound, 'Profile'],
      ] as const)
}
