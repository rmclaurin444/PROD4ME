export const beats = [
  { title: 'NIGHTSHIFT', producer: 'Melo K', tags: ['dark trap', 'drill'], bpm: 142, key: 'F# minor', price: 49, plays: '84.2K', likes: 12400, shares: 320, comments: 9, saves: 1820, art: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=85', avatar: 'MK' },
  { title: 'VELVET ROOM', producer: 'Nia Saint', tags: ['melodic', 'r&b'], bpm: 88, key: 'A minor', price: 120, plays: '52.8K', likes: 8900, shares: 187, comments: 4, saves: 940, art: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=900&q=85', avatar: 'NS' },
  { title: 'LATE CHECKOUT', producer: 'Juno Grey', tags: ['boom bap', 'lo-fi'], bpm: 76, key: 'C major', price: 35, plays: '31.1K', likes: 5300, shares: 96, comments: 2, saves: 610, art: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=900&q=85', avatar: 'JG' },
  { title: 'NO SIGNAL', producer: 'Trey Two', tags: ['dark trap', '808 heavy'], bpm: 148, key: 'D minor', price: 75, plays: '109K', likes: 15200, shares: 540, comments: 12, saves: 2310, art: 'https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=900&q=85', avatar: 'TT' },
]

export function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(n)
}

export const themes = [
  { id: 'acid', accent: '#d6ff4b', bg: '#101010', text: '#f7f7f2' },
  { id: 'cyan', accent: '#38e8d0', bg: '#071514', text: '#edfffc' },
  { id: 'coral', accent: '#ff7f66', bg: '#1b0f0d', text: '#fff5f1' },
  { id: 'blue', accent: '#70a7ff', bg: '#0c1220', text: '#f2f6ff' }
]

export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
