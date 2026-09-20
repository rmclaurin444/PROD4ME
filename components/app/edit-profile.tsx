'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/app/ui'
import { themes } from '@/components/app/data'

export function EditProfile({
  theme,
  setTheme,
  banner,
  setBanner,
  bio,
  setBio,
  avatar,
  onClose,
}: {
  theme: { id: string; accent: string; bg: string; text: string }
  setTheme: (t: { id: string; accent: string; bg: string; text: string }) => void
  banner: string
  setBanner: (b: string) => void
  bio: string
  setBio: (b: string) => void
  avatar: string
  onClose: () => void
}) {
  const [draft, setDraft] = useState(theme)
  const [draftBanner, setDraftBanner] = useState(banner)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-5 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-[#151515] p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-lime-300">Profile customization</p>
            <h2 className="mt-1 text-2xl font-black">Edit Profile</h2>
          </div>
          <button onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>

        <div
          className="mt-5 overflow-hidden rounded-2xl border border-white/10"
          style={{ background: draft.bg, color: draft.text }}
        >
          <div className="h-24 bg-cover bg-center" style={{ backgroundImage: `url(${draftBanner})` }} />
          <div className="p-4">
            <Avatar text={avatar} size="size-16" />
            <p className="mt-2 text-xl font-black">Live preview</p>
            <p className="text-xs opacity-70">{bio}</p>
          </div>
        </div>

        <label className="mt-6 block text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Bio
          <textarea
            aria-label="Profile bio"
            value={bio}
            onChange={e => setBio(e.target.value)}
            className="input mt-2 min-h-24 resize-y"
            placeholder="Tell people about yourself"
          />
        </label>

        <p className="mt-6 text-xs font-bold uppercase tracking-widest text-muted-foreground">Theme colors</p>
        <div className="mt-3 grid grid-cols-4 gap-3">
          {themes.map(t => (
            <button
              key={t.id}
              onClick={() => setDraft(t)}
              className={`rounded-2xl border p-3 text-left ${
                draft.id === t.id ? 'border-lime-300' : 'border-white/10'
              }`}
            >
              <span className="mb-2 block size-8 rounded-full" style={{ background: t.accent }} />
              <span className="text-xs font-bold">{t.id}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-4">
          <div
            className="relative size-24 shrink-0 rounded-full"
            style={{ background: 'conic-gradient(#ff3344, #ffe600, #32e875, #18c8ff, #684cff, #ed3cff, #ff3344)' }}
          >
            <input
              aria-label="Choose profile accent color"
              type="color"
              value={draft.accent}
              onChange={e => setDraft({ ...draft, id: 'custom', accent: e.target.value })}
              className="absolute inset-6 size-12 cursor-pointer rounded-full opacity-0"
            />
            <div className="pointer-events-none absolute inset-5 rounded-full border-4 border-[#151515]" />
          </div>
          <div>
            <p className="text-xs font-bold text-muted-foreground">RGB theme wheel</p>
            <p className="mt-1 text-xs text-muted-foreground">Choose your accent color</p>
            <span className="mt-2 inline-block text-xs font-black uppercase" style={{ color: draft.accent }}>
              {draft.accent}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs font-bold text-muted-foreground">
            Background
            <input
              type="color"
              value={draft.bg}
              onChange={e => setDraft({ ...draft, id: 'custom', bg: e.target.value })}
              className="mt-2 block size-8 cursor-pointer"
            />
          </label>
          <label className="rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs font-bold text-muted-foreground">
            Text color
            <input
              type="color"
              value={draft.text}
              onChange={e => setDraft({ ...draft, id: 'custom', text: e.target.value })}
              className="mt-2 block size-8 cursor-pointer"
            />
          </label>
        </div>

        <label className="mt-6 block text-xs font-bold text-muted-foreground">
          Banner image upload
          <input
            type="file"
            accept="image/*"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) {
                const reader = new FileReader()
                reader.onload = () => setDraftBanner(String(reader.result))
                reader.readAsDataURL(file)
              }
            }}
            className="mt-2 block w-full cursor-pointer rounded-xl border border-dashed border-white/20 bg-white/[.03] p-3 text-xs text-muted-foreground"
          />
        </label>

        <div className="mt-6 flex gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setDraft(themes[0])
              setDraftBanner(banner)
            }}
            className="flex-1 border-white/20"
          >
            Reset to Default
          </Button>
          <Button
            onClick={() => {
              setTheme(draft)
              setBanner(draftBanner)
              onClose()
            }}
            className="flex-1 bg-lime-300 font-black text-black"
          >
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  )
}
