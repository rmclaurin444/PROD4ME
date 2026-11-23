'use client'

import { useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/app/ui'
import { themes } from '@/components/app/data'
import { CropDialog } from '@/components/app/crop-dialog'

/**
 * Edit Profile modal. Saves bio, theme (id or custom JSON string), avatar
 * (object key) and banner (object key) through PATCH /api/profile — replacing
 * the old data-URL banner that was lost on reload. Images are cropped on the
 * client before uploading; the replaced file is deleted from storage by the
 * profile route when swapped.
 */
export function EditProfile({
  theme,
  setTheme,
  banner,
  setBanner,
  bio,
  setBio,
  avatar,
  setAvatar,
  onClose,
}: {
  theme: { id: string; accent: string; bg: string; text: string }
  setTheme: (t: { id: string; accent: string; bg: string; text: string }) => void
  banner: string
  setBanner: (b: string) => void
  bio: string
  setBio: (b: string) => void
  avatar: string | null
  setAvatar: (a: string | null) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(theme)
  const [draftBanner, setDraftBanner] = useState(banner)
  const [draftBio, setDraftBio] = useState(bio)
  const [draftAvatar, setDraftAvatar] = useState<string | null>(avatar)

  const [bannerCrop, setBannerCrop] = useState<File | null>(null)
  const [avatarCrop, setAvatarCrop] = useState<File | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    try {
      // uploads: presign → PUT → return the object key
      const presign = async (kind: 'avatar' | 'banner', file: File) => {
        const res = await fetch('/api/uploads/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, contentType: file.type || 'image/webp' }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Could not prepare upload')
        await fetch(data.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'image/webp' },
          body: file,
        })
        return data.key as string
      }

      const patch: { bio: string; theme: string; avatar?: string; banner?: string } = {
        bio: draftBio,
        theme: draft.id === 'custom' ? JSON.stringify(draft) : draft.id,
      }

      if (avatarTmp) patch.avatar = await presign('avatar', avatarTmp)
      if (bannerTmp) patch.banner = await presign('banner', bannerTmp)
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not save profile')

      // update the parent state so the page reflects the change without reload
      setBio(draftBio)
      setTheme(draft)
      if (patch.avatar) setAvatar(patch.avatar)
      if (patch.banner) setBanner(patch.banner)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/75 p-5 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-surface p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-brand">Profile customization</p>
            <h2 className="mt-1 text-2xl font-black">Edit Profile</h2>
          </div>
          <button onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>

        <div
          className="mt-5 overflow-hidden rounded-2xl border border-border"
          style={{ background: draft.bg, color: draft.text }}
        >
          <div className="aspect-[3/1] bg-cover bg-center" style={{ backgroundImage: `url(${draftBanner})` }} />
          <div className="p-4">
            <Avatar text={(avatar ?? '').slice(0, 2)} src={draftAvatar} size="size-16" />
            <p className="mt-2 text-xl font-black">Live preview</p>
            <p className="text-xs opacity-70">{draftBio}</p>
          </div>
        </div>

        <label className="mt-6 block text-xs font-bold text-muted-foreground">
          Bio
          <textarea
            aria-label="Profile bio"
            value={draftBio}
            onChange={e => setDraftBio(e.target.value)}
            className="input mt-2 min-h-24 resize-y"
            placeholder="Tell people about yourself"
          />
        </label>

        {/* avatar upload (crop on select) */}
        <p className="mt-6 text-xs font-bold uppercase tracking-widest text-muted-foreground">Profile picture</p>
        <div className="mt-2 flex items-center gap-3">
          <Avatar text={(avatar ?? '').slice(0, 2)} src={draftAvatar} size="size-14" />
          <label className="flex-1 cursor-pointer rounded-xl border border-dashed border-border bg-surface p-3 text-xs text-muted-foreground">
            {avatarCrop ? 'New picture cropped — click to replace' : 'Click to choose a picture (1:1 crop)'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) setAvatarCrop(file)
                e.target.value = ''
              }}
            />
          </label>
        </div>

        <p className="mt-6 text-xs font-bold uppercase tracking-widest text-muted-foreground">Theme colors</p>
        <div className="mt-3 grid grid-cols-4 gap-3">
          {themes.map(t => (
            <button
              key={t.id}
              onClick={() => setDraft(t)}
              className={`rounded-2xl border p-3 text-left ${
                draft.id === t.id ? 'border-brand' : 'border-border'
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
            <div className="pointer-events-none absolute inset-5 rounded-full border-4 border-border" />
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
          <label className="rounded-xl border border-border bg-surface p-3 text-xs font-bold text-muted-foreground">
            Background
            <input
              type="color"
              value={draft.bg}
              onChange={e => setDraft({ ...draft, id: 'custom', bg: e.target.value })}
              className="mt-2 block size-8 cursor-pointer"
            />
          </label>
          <label className="rounded-xl border border-border bg-surface p-3 text-xs font-bold text-muted-foreground">
            Text color
            <input
              type="color"
              value={draft.text}
              onChange={e => setDraft({ ...draft, id: 'custom', text: e.target.value })}
              className="mt-2 block size-8 cursor-pointer"
            />
          </label>
        </div>

        <p className="mt-6 text-xs font-bold uppercase tracking-widest text-muted-foreground">Banner image</p>
        <label className="mt-2 block cursor-pointer rounded-xl border border-dashed border-border bg-surface p-3 text-xs text-muted-foreground">
          {bannerCrop ? 'New banner cropped — click to replace' : 'Click to choose a banner (3:1 crop)'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) setBannerCrop(file)
              e.target.value = ''
            }}
          />
        </label>

        {error && <p className="mt-4 text-sm font-semibold text-error">{error}</p>}

        <div className="mt-6 flex gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setDraft(themes[0])
              setDraftBanner(banner)
            }}
            className="flex-1 border-border"
          >
            Reset to Default
          </Button>
          <Button
            onClick={() => void save()}
            disabled={saving}
            className="flex-1 bg-brand font-black text-brand-foreground disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Check size={16} className="mr-2" />}
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </div>

        {avatarCrop && (
          <CropDialog
            file={avatarCrop}
            shape="circle"
            title="Crop profile picture"
            onCancel={() => setAvatarCrop(null)}
            onDone={cropped => {
              setAvatarCrop(null)
              // the cropped file is held until save; preview it immediately
              const url = URL.createObjectURL(cropped)
              setDraftAvatar(url)
              // stash the file for the presign path
              avatarTmp = cropped
            }}
          />
        )}
        {bannerCrop && (
          <CropDialog
            file={bannerCrop}
            shape="rect"
            title="Crop banner"
            onCancel={() => setBannerCrop(null)}
            onDone={cropped => {
              setBannerCrop(null)
              const url = URL.createObjectURL(cropped)
              setDraftBanner(url)
              bannerTmp = cropped
            }}
          />
        )}
      </div>
    </div>
  )
}

// files held after crop, uploaded on save
let avatarTmp: File | null = null
let bannerTmp: File | null = null

