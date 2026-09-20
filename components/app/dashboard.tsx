'use client'

import { TagPills } from '@/components/app/ui'

export function Dashboard({ userName }: { userName: string }) {
  const firstName = userName.trim().split(/\s+/)[0]

  return (
    <div className="mx-auto w-full max-w-5xl overflow-y-auto px-5 pb-28 pt-24 md:px-12">
      <p className="text-xs font-bold uppercase tracking-widest text-lime-300">Producer dashboard</p>
      <h1 className="mt-2 text-4xl font-black">Good morning, {firstName}.</h1>

      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Total plays', '389.4K'],
          ['Likes', '42.8K'],
          ['Offers received', '86'],
        ].map(([a, b]) => (
          <div className="rounded-2xl border border-white/10 bg-white/[.03] p-4" key={a}>
            <p className="text-xs font-bold text-muted-foreground">{a}</p>
            <p className="mt-2 text-2xl font-black">{b}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-lime-300/20 bg-lime-300/[.06] p-5">
        <TagPills tags={['dark trap', 'melodic']} />
        <p className="mt-4 text-lg font-black">Your #darktrap tagged beats get 2x more plays.</p>
      </div>
    </div>
  )
}
