'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, AudioLines, Plus, Sliders, Users } from 'lucide-react'
import type { StudioBeat, StudioProject, StudioUser } from '@/lib/studio/types'
import { formatDate } from '@/lib/studio/mock-data'

const ACCESS_LABEL: Record<StudioBeat['access'], string> = {
  free: 'Free',
  licensed: 'Licensed',
  trial: 'Trial',
}

const ACCESS_CLASS: Record<StudioBeat['access'], string> = {
  free: 'bg-lime-300/20 text-lime-300',
  licensed: 'bg-emerald-500/20 text-emerald-300',
  trial: 'bg-amber-400/15 text-amber-300',
}

export function AccessBadge({ access }: { access: StudioBeat['access'] }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${ACCESS_CLASS[access]}`}
    >
      {ACCESS_LABEL[access]}
    </span>
  )
}

export function StudioChrome({
  user,
  children,
}: {
  user: StudioUser
  children: React.ReactNode
}) {
  return (
    <main className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-black/40 px-6 py-4">
        <div className="flex items-center gap-5">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-bold text-muted-foreground hover:text-lime-300"
          >
            <ArrowLeft size={16} />
            Back to Discover
          </Link>
          <div className="flex items-center gap-2">
            <div className="grid size-7 place-items-center rounded-md bg-lime-300 text-black">
              <Sliders size={14} />
            </div>
            <span className="text-sm font-black uppercase tracking-widest text-lime-300">
              Studio
            </span>
          </div>
        </div>
        <span className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-xs font-black">
          {user.name} · Artist
        </span>
      </header>
      {children}
    </main>
  )
}

export function StudioHome({
  user,
  projects,
  catalog,
  onOpenProject,
  onNewProject,
}: {
  user: StudioUser
  projects: StudioProject[]
  catalog: StudioBeat[]
  onOpenProject: (id: string) => void
  onNewProject: (name: string, beat: StudioBeat | null) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  return (
    <StudioChrome user={user}>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-y-auto px-8 py-10">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tighter">Your projects</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Record vocals over beats — pick up where you left off or start something new.
            </p>
          </div>
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-lime-300 px-5 py-3 text-sm font-black text-black hover:bg-lime-200"
          >
            <Plus size={18} />
            New Project
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="mt-24 flex flex-col items-center rounded-3xl border border-dashed border-white/15 py-20 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-white/[.04] text-lime-300">
              <AudioLines size={26} />
            </div>
            <h2 className="mt-5 text-2xl font-black">No projects yet</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Start your first session — load a beat, record takes, and build a song.
            </p>
            <button
              onClick={() => setPickerOpen(true)}
              className="mt-6 flex items-center gap-2 rounded-xl bg-lime-300 px-5 py-3 text-sm font-black text-black hover:bg-lime-200"
            >
              <Plus size={18} />
              New Project
            </button>
          </div>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {projects.map(project => {
              const beat = catalog.find(b => b.id === project.beatId) ?? null
              return (
                <button
                  key={project.id}
                  onClick={() => onOpenProject(project.id)}
                  className="group flex flex-col rounded-3xl border border-white/10 bg-white/[.03] p-5 text-left transition hover:border-lime-300/50 hover:bg-white/[.05]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="truncate text-lg font-black">{project.name}</span>
                    <AccessBadge access={beat?.access ?? 'free'} />
                  </div>
                  <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <Users size={13} />
                    Beat:
                    <span className="text-foreground">{beat ? beat.title : 'No beat loaded'}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Last edited {formatDate(project.lastEditedAt)}
                  </p>
                  <div className="mt-5 flex items-center gap-2 border-t border-white/5 pt-4 text-[11px] text-muted-foreground">
                    <span className="rounded-md bg-white/5 px-1.5 py-0.5">{project.bpm} BPM</span>
                    <span className="rounded-md bg-white/5 px-1.5 py-0.5">{project.musicalKey}</span>
                    <span className="rounded-md bg-white/5 px-1.5 py-0.5">{project.timeSignature}</span>
                    <span className="ml-auto font-black text-lime-300 opacity-0 transition group-hover:opacity-100">
                      Open →
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {pickerOpen && (
        <NewProjectPicker
          catalog={catalog}
          onClose={() => setPickerOpen(false)}
          onNewProject={(name, beat) => {
            setPickerOpen(false)
            onNewProject(name, beat)
          }}
        />
      )}
    </StudioChrome>
  )
}

function NewProjectPicker({
  catalog,
  onClose,
  onNewProject,
}: {
  catalog: StudioBeat[]
  onClose: () => void
  onNewProject: (name: string, beat: StudioBeat | null) => void
}) {
  const [name, setName] = useState('Untitled project')
  const [beatId, setBeatId] = useState<string | null>(null)

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-5">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-3xl border border-white/10 bg-[#151515] p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-lime-300">Studio</p>
            <h2 className="mt-1 text-2xl font-black">New project</h2>
          </div>
          <button onClick={onClose} aria-label="Close">
            <span className="text-2xl leading-none">×</span>
          </button>
        </div>

        <label className="mt-6 block text-xs font-bold text-muted-foreground">
          Project name
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="input mt-2"
            placeholder="Untitled project"
            autoFocus
          />
        </label>

        <p className="mt-6 text-xs font-bold text-muted-foreground">Start with a beat (optional)</p>
        <div className="mt-2 flex-1 space-y-2 overflow-y-auto pr-1">
          {catalog.map(beat => (
            <button
              key={beat.id}
              onClick={() => setBeatId(current => (current === beat.id ? null : beat.id))}
              className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left ${
                beatId === beat.id
                  ? 'border-lime-300/60 bg-lime-300/[.08]'
                  : 'border-white/10 bg-white/[.03]'
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-black">
                  {beat.title}
                  {beat.isDemo && <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">Demo</span>}
                </span>
                <span className="text-xs text-muted-foreground">{beat.producer}</span>
              </span>
              <AccessBadge access={beat.access} />
            </button>
          ))}
        </div>

        <button
          onClick={() => onNewProject(name.trim() || 'Untitled project', catalog.find(b => b.id === beatId) ?? null)}
          className="mt-5 rounded-xl bg-lime-300 py-3 text-sm font-black text-black hover:bg-lime-200"
        >
          Create project
        </button>
      </div>
    </div>
  )
}
