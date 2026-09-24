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
