'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ShapedBeat } from '@/lib/beats'
import type {
  BeatAccess,
  SaveStatus,
  StudioBeat,
  StudioProject,
  StudioUser,
} from '@/lib/studio/types'
import { buildDemoBeats, buildInitialProjects, createProject } from '@/lib/studio/mock-data'
import { StudioHome } from '@/components/studio/studio-home'
import { Workspace } from '@/components/studio/workspace'

/** TODO(dev-panel): `previewAudioUrl` for tagged previews will be configured
 *  in the developer panel once the audio-tag pipeline exists. Trial beats
 *  only ever reference `previewAudioUrl`; `licensedAudioUrl` stays null until
 *  a real license grants access to the clean audio. */
function shapeFromReal(
  beat: ShapedBeat,
  licensedIds: Set<string>,
  pendingIds: Set<string>
): StudioBeat {
  const access: BeatAccess =
    beat.price === 0 ? 'free' : licensedIds.has(beat.id) ? 'licensed' : 'trial'
  return {
    id: beat.id,
    title: beat.title,
    producer: beat.producer,
    bpm: beat.bpm,
    musicalKey: beat.musicalKey,
    price: beat.price,
    access,
    offerPending: pendingIds.has(beat.id),
    previewAudioUrl: beat.audioUrl,
    licensedAudioUrl: access === 'trial' ? null : beat.audioUrl,
    durationSec: beat.durationSec ?? 12,
    // Full shaped beat so the existing PurchaseModal (buy / offer flows)
    // works verbatim inside the trial banner.
    purchase: {
      id: beat.id,
      title: beat.title,
      price: beat.price,
      exclusivePriceCents: beat.exclusivePriceCents,
      exclusiveSold: beat.exclusiveSold,
    },
    isDemo: false,
  }
}

export function StudioApp({
  user,
  beats,
  licensedBeatIds,
  pendingOfferBeatIds,
  entryBeatId,
}: {
  user: StudioUser
  beats: ShapedBeat[]
  licensedBeatIds: string[]
  pendingOfferBeatIds: string[]
  entryBeatId: string | null
}) {
  const router = useRouter()

  const [catalog, setCatalog] = useState<StudioBeat[]>(() => {
    const licensed = new Set(licensedBeatIds)
    const pending = new Set(pendingOfferBeatIds)
    const shaped = beats.map(b => shapeFromReal(b, licensed, pending))
    // .unshift() the demos so Studio can always show free / licensed / trial
    // even if the artist's real catalog doesn't cover a state yet.
    const states = new Set(shaped.map(b => b.access))
    const demos = buildDemoBeats().filter(d => !states.has(d.access))
    return [...demos, ...shaped]
  })

  const [projects, setProjects] = useState<StudioProject[]>(() => buildInitialProjects([]))
  const [openProjectId, setOpenProjectId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const saveTimers = useRef<{ saving?: number; saved?: number }>({})

  const patchProject = useCallback(
    (projectId: string, updater: (p: StudioProject) => StudioProject) => {
      setProjects(ps =>
        ps.map(p =>
          p.id === projectId ? { ...updater(p), lastEditedAt: new Date().toISOString() } : p
        )
      )
      if (openProjectId !== projectId) return
      setSaveStatus('unsaved')
      const timers = saveTimers.current
      window.clearTimeout(timers.saved)
      window.clearTimeout(timers.saving)
      timers.saving = window.setTimeout(() => {
        setSaveStatus('saving')
        timers.saved = window.setTimeout(() => setSaveStatus('saved'), 900)
      }, 500)
    },
    [openProjectId]
  )

  // Projects are seeded once the initial catalog render is committed so demo
  // projects always reference beats that exist in the visible catalog.
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    // entry beats arrive with ?beat=… from the feed's open/try actions
    const entry = entryBeatId ? catalog.find(b => b.id === entryBeatId) : null
    if (entry) {
      const project = createProject(entry.title, entry)
      setProjects([project, ...buildInitialProjects(catalog)])
      setOpenProjectId(project.id)
      setSaveStatus('unsaved')
    } else {
      setProjects(buildInitialProjects(catalog))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** A completed purchase/offer grant flips the beat's access to licensed —
   *  banner + export unlock reactively; the DB refresh is only cosmetic here. */
  const promoteBeatToLicensed = useCallback((beatId: string) => {
    setCatalog(cs =>
      cs.map(b =>
        b.id === beatId
          ? { ...b, access: 'licensed' as const, offerPending: false, licensedAudioUrl: b.previewAudioUrl }
          : b
      )
    )
    router.refresh()
  }, [router])

  const openProject = projects.find(p => p.id === openProjectId) ?? null

  if (openProject) {
    return (
      <Workspace
        user={user}
        project={openProject}
        catalog={catalog}
        saveStatus={saveStatus}
        onPatch={updater => patchProject(openProject.id, updater)}
        onBack={() => {
          setOpenProjectId(null)
          setSaveStatus('saved')
        }}
        onBeatLicensed={promoteBeatToLicensed}
      />
    )
  }

  return (
    <StudioHome
      user={user}
      projects={projects}
      catalog={catalog}
      onOpenProject={id => {
        setOpenProjectId(id)
        setSaveStatus('saved')
      }}
      onNewProject={(name, beat) => {
        const p = createProject(name, beat)
        setProjects(ps => [p, ...ps])
        setOpenProjectId(p.id)
        setSaveStatus('unsaved')
      }}
    />
  )
}
