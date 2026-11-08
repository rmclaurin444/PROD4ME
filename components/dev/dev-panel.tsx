'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  Database,
  FlaskConical,
  Loader2,
  Music4,
  Trash2,
  Upload,
  XCircle,
  Zap,
} from 'lucide-react'

type SeedAccount = { email: string; role: string; interests: string[] }

type SeedSummary = {
  producers: number
  artists: number
  beats: number
  events: number
  genres: string[]
  audioMode: 'files' | 'synthetic'
  elapsedMs: number
  accounts: SeedAccount[]
}

type DevStats = { users: number; beats: number; events: number; poolFiles: number; poolBytes: number }

type DumpItem = {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
  beatTitle?: string
}

type DumpMode = 'pool' | 'beat'

const AUDIO_ACCEPT = '.mp3,.wav,.aiff,.aif,.flac,audio/mpeg,audio/wav,audio/aiff,audio/flac'

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** XHR (not fetch) so we get real upload progress per file. */
function uploadDumpFile(
  file: File,
  genres: string,
  mode: DumpMode,
  onProgress: (percent: number) => void,
): Promise<{ title?: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/dev/dump')
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText) as { title?: string }
          resolve(body)
        } catch {
          resolve({})
        }
      } else {
        let message = `Upload failed (${xhr.status})`
        try {
          const body = JSON.parse(xhr.responseText) as { error?: string }
          if (body.error) message = body.error
        } catch {
          // keep default message
        }
        reject(new Error(message))
      }
    })
    xhr.addEventListener('error', () => reject(new Error('Upload failed — network error')))
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')))

    const form = new FormData()
    form.append('file', file)
    form.append('genres', genres)
    form.append('mode', mode)
    xhr.send(form)
  })
}

export function DevPanel() {
  // ---- seeder state ----
  const [beats, setBeats] = useState(200)
  const [producers, setProducers] = useState(8)
  const [artists, setArtists] = useState(10)
  const [eventsPerUser, setEventsPerUser] = useState(40)
  const [seed, setSeed] = useState('')
  const [genres, setGenres] = useState('trap, drill, house, lofi, ambient, jazz')
  const [seeding, setSeeding] = useState(false)
  const [summary, setSummary] = useState<SeedSummary | null>(null)
  const [seedError, setSeedError] = useState<string | null>(null)
  const [purging, setPurging] = useState(false)

  // ---- dump state ----
  const [dumpGenres, setDumpGenres] = useState('dev-dump')
  const [dumpItems, setDumpItems] = useState<DumpItem[]>([])
  const [dumping, setDumping] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // ---- stats ----
  const [stats, setStats] = useState<DevStats | null>(null)
  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch('/api/dev/seed')
      if (res.ok) setStats((await res.json()) as DevStats)
    } catch {
      // panel stats are cosmetic
    }
  }, [])
  useEffect(() => {
    void refreshStats()
  }, [refreshStats])

  async function runSeeder() {
    setSeeding(true)
    setSeedError(null)
    setSummary(null)
    try {
      const res = await fetch('/api/dev/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beats,
          producers,
          artists,
          eventsPerUser,
          genres: genres.split(',').map(g => g.trim()).filter(Boolean),
          seed: seed.trim() === '' ? undefined : Number(seed),
        }),
      })
      const body = (await res.json()) as SeedSummary & { error?: string }
      if (!res.ok) throw new Error(body.error ?? `Seed failed (${res.status})`)
      setSummary(body)
      void refreshStats()
    } catch (error) {
      setSeedError(error instanceof Error ? error.message : 'Seed failed')
    } finally {
      setSeeding(false)
    }
  }

  async function purge() {
    if (!window.confirm('Delete ALL dev-* accounts and their beats/events? Real accounts are untouched.')) return
    setPurging(true)
    setSeedError(null)
    try {
      const res = await fetch('/api/dev/seed', { method: 'DELETE' })
      const body = (await res.json()) as { purged?: number; error?: string }
      if (!res.ok) throw new Error(body.error ?? 'Purge failed')
      setSummary(null)
      void refreshStats()
    } catch (error) {
      setSeedError(error instanceof Error ? error.message : 'Purge failed')
    } finally {
      setPurging(false)
    }
  }

  function addFiles(files: FileList | File[]) {
    const items = Array.from(files)
      .filter(f => f.size > 0)
      .map(file => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        status: 'pending' as const,
        progress: 0,
      }))
    setDumpItems(prev => [...prev, ...items])
  }

  async function runDump(mode: DumpMode) {
    const pending = dumpItems.filter(item => item.status === 'pending')
    if (pending.length === 0) return
    setDumping(true)
    for (const item of pending) {
      setDumpItems(prev =>
        prev.map(entry => (entry.id === item.id ? { ...entry, status: 'uploading', progress: 0 } : entry)),
      )
      try {
        const result = await uploadDumpFile(item.file, dumpGenres, mode, progress =>
          setDumpItems(prev =>
            prev.map(entry => (entry.id === item.id ? { ...entry, progress } : entry)),
          ),
        )
        setDumpItems(prev =>
          prev.map(entry =>
            entry.id === item.id
              ? { ...entry, status: 'done', progress: 100, beatTitle: result.title ?? (mode === 'pool' ? 'pool' : undefined) }
              : entry,
          ),
        )
      } catch (error) {
        setDumpItems(prev =>
          prev.map(entry =>
            entry.id === item.id
              ? { ...entry, status: 'error', error: error instanceof Error ? error.message : 'Failed' }
              : entry,
          ),
        )
      }
    }
    setDumping(false)
    void refreshStats()
  }

  async function clearPool() {
    if (!window.confirm('Empty the dev audio pool? Files already seeded into beats are unaffected.')) return
    setPurging(true)
    try {
      await fetch('/api/dev/pool', { method: 'DELETE' })
      void refreshStats()
    } finally {
      setPurging(false)
    }
  }

  const dumpDone = dumpItems.filter(item => item.status === 'done').length
  const dumpFailed = dumpItems.filter(item => item.status === 'error').length
  const dumpPending = dumpItems.filter(item => item.status === 'pending').length

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-lg bg-lime-300 text-black">
              <FlaskConical size={18} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter">
                DEV <span className="text-lime-300">PANEL</span>
              </h1>
              <p className="text-xs text-muted-foreground">
                Test-data tooling — disabled in production builds.
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-bold text-muted-foreground transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft size={13} />
            Back to app
          </Link>
        </div>

        {/* stats strip */}
        <div className="mt-8 grid grid-cols-3 gap-3">
          {[
            { label: 'Dev users', value: stats?.users, icon: Database },
            { label: 'Dev beats', value: stats?.beats, icon: Music4 },
            { label: 'Dev events', value: stats?.events, icon: Activity },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
              <Icon size={16} className="text-lime-300" />
              <p className="mt-2 text-2xl font-black tabular-nums">
                {value === undefined ? '—' : value.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* ---------------- seeder ---------------- */}
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[.03] p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-lime-300">Dataset Seeder</h2>
            <button
              onClick={purge}
              disabled={purging}
              className="flex items-center gap-1.5 rounded-lg border border-red-400/30 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-400/10 disabled:opacity-50"
            >
              {purging ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              Purge dev data
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Creates <code className="text-lime-300">dev-*@prod4me.dev</code> accounts, tags beats across the
            genre pool, and simulates biased listening histories so taste vectors form real clusters. Password
            is always <code className="text-lime-300">password123</code>.
          </p>

          <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2">
            <p className="text-xs">
              <span className="font-bold uppercase tracking-wider text-muted-foreground">Audio source: </span>
              {stats && stats.poolFiles > 0 ? (
                <span className="font-semibold text-lime-300">
                  your pool — {stats.poolFiles} file{stats.poolFiles === 1 ? '' : 's'} (
                  {formatSize(stats.poolBytes)}) drawn randomly per beat
                </span>
              ) : (
                <span className="font-semibold">synthetic WAVs — drop files below to seed with your own audio</span>
              )}
            </p>
            {stats && stats.poolFiles > 0 && (
              <button
                onClick={clearPool}
                disabled={purging}
                className="ml-3 shrink-0 rounded-lg border border-white/15 px-2.5 py-1 text-[11px] font-bold text-muted-foreground transition hover:bg-white/10 hover:text-white disabled:opacity-50"
              >
                {purging ? '…' : 'Clear pool'}
              </button>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(
              [
                ['Beats', beats, setBeats, 1, 2000],
                ['Producers', producers, setProducers, 1, 50],
                ['Artists', artists, setArtists, 1, 100],
                ['Events / user', eventsPerUser, setEventsPerUser, 0, 500],
                ['Seed', null, null, null, null],
              ] as const
            ).map(([label, value, setter, min, max]) => (
              <label key={label} className="block">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {label}
                </span>
                <input
                  type="number"
                  value={value ?? seed}
                  min={min ?? undefined}
                  max={max ?? undefined}
                  placeholder={label === 'Seed' ? 'random' : undefined}
                  onChange={e => {
                    if (setter) setter(Number(e.target.value))
                    else setSeed(e.target.value)
                  }}
                  className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm font-semibold outline-none focus:border-lime-300/60"
                />
              </label>
            ))}
          </div>

          <label className="mt-3 block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Genre pool (comma-separated)
            </span>
            <input
              type="text"
              value={genres}
              onChange={e => setGenres(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm font-semibold outline-none focus:border-lime-300/60"
            />
          </label>

          <button
            onClick={runSeeder}
            disabled={seeding}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-lime-300 px-4 py-3 text-sm font-black text-black transition hover:bg-lime-200 disabled:opacity-50"
          >
            {seeding ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} fill="currentColor" />}
            {seeding ? 'Seeding… this can take a minute' : `Seed ${beats} beats`}
          </button>

          {seedError && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-300">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              {seedError}
            </div>
          )}

          {summary && (
            <div className="mt-4 rounded-xl border border-lime-300/30 bg-lime-300/[.06] p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-lime-300">
                <CheckCircle2 size={15} />
                Seeded in {(summary.elapsedMs / 1000).toFixed(1)}s ({summary.audioMode} audio)
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {summary.beats} beats · {summary.producers} producers · {summary.artists} artists ·{' '}
                {summary.events} events · genres: {summary.genres.join(', ')}
              </p>
              <div className="mt-3 grid gap-1 sm:grid-cols-2">
                {summary.accounts.map(account => (
                  <div key={account.email} className="flex items-center gap-2 text-xs">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-black ${
                        account.role === 'ARTIST' ? 'bg-white/10 text-white' : 'bg-lime-300 text-black'
                      }`}
                    >
                      {account.role === 'ARTIST' ? 'ART' : 'PRD'}
                    </span>
                    <span className="truncate font-mono">{account.email}</span>
                    {account.interests.length > 0 && (
                      <span className="truncate text-muted-foreground">· {account.interests.join(', ')}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ---------------- mass dump ---------------- */}
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[.03] p-6">
          <h2 className="text-sm font-bold uppercase tracking-widest text-lime-300">Mass Audio Dump</h2>
          <p className="mt-2 text-xs text-muted-foreground">
            Drop a pile of audio files, then either <span className="font-semibold text-white">add them to the
            pool</span> (the seeder draws from them randomly across dummy producers) or{' '}
            <span className="font-semibold text-white">dump them as beats now</span> (one beat per file,
            instantly playable).
          </p>

          <label className="mt-4 block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Tag pool for dumped beats (comma-separated)
            </span>
            <input
              type="text"
              value={dumpGenres}
              onChange={e => setDumpGenres(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm font-semibold outline-none focus:border-lime-300/60"
            />
          </label>

          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => {
              e.preventDefault()
              setDragging(false)
              if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
            }}
            className={`mt-4 grid cursor-pointer place-items-center rounded-2xl border border-dashed p-10 transition ${
              dragging ? 'border-lime-300 bg-lime-300/10' : 'border-white/20 bg-black/20 hover:border-white/40'
            }`}
          >
            <div className="pointer-events-none text-center">
              <Upload className={`mx-auto mb-3 ${dragging ? 'text-lime-300' : 'text-muted-foreground'}`} size={26} />
              <p className="text-sm font-bold">Drop audio files here</p>
              <p className="mt-1 text-xs text-muted-foreground">MP3, WAV, AIFF or FLAC · Max 250MB each</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={AUDIO_ACCEPT}
              multiple
              className="hidden"
              onChange={e => {
                if (e.target.files?.length) addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>

          {dumpItems.length > 0 && (
            <>
              <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
                {dumpItems.map(item => (
                  <div key={item.id} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                    <div className="flex items-center gap-2">
                      {item.status === 'pending' && <CircleDashed size={14} className="shrink-0 text-muted-foreground" />}
                      {item.status === 'uploading' && <Loader2 size={14} className="shrink-0 animate-spin text-lime-300" />}
                      {item.status === 'done' && <CheckCircle2 size={14} className="shrink-0 text-lime-300" />}
                      {item.status === 'error' && <XCircle size={14} className="shrink-0 text-red-400" />}
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                        {item.file.name}
                        {item.status === 'done' && item.beatTitle && (
                          <span className="ml-1 text-muted-foreground">
                            {item.beatTitle === 'pool' ? '→ added to pool' : `→ “${item.beatTitle}”`}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{formatSize(item.file.size)}</span>
                    </div>
                    {item.status === 'uploading' && (
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full bg-lime-300 transition-all" style={{ width: `${item.progress}%` }} />
                      </div>
                    )}
                    {item.error && <p className="mt-1 text-[11px] text-red-400">{item.error}</p>}
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  onClick={() => runDump('pool')}
                  disabled={dumping || dumpPending === 0}
                  className="flex items-center justify-center gap-2 rounded-xl bg-lime-300 px-4 py-3 text-sm font-black text-black transition hover:bg-lime-200 disabled:opacity-50"
                >
                  {dumping ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
                  {dumping
                    ? `Uploading… ${dumpDone}/${dumpItems.length}`
                    : `Add ${dumpPending > 0 ? dumpPending : ''} to pool`}
                </button>
                <button
                  onClick={() => runDump('beat')}
                  disabled={dumping || dumpPending === 0}
                  className="flex items-center justify-center gap-2 rounded-xl border border-lime-300/50 px-4 py-3 text-sm font-black text-lime-300 transition hover:bg-lime-300/10 disabled:opacity-50"
                >
                  {dumping ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  {dumping
                    ? `Uploading… ${dumpDone}/${dumpItems.length}`
                    : `Dump ${dumpPending > 0 ? dumpPending : ''} as beats`}
                </button>
              </div>
              {(dumpDone > 0 || dumpFailed > 0) && !dumping && (
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  {dumpDone} uploaded{dumpFailed > 0 ? ` · ${dumpFailed} failed` : ''} — pool files are drawn
                  randomly by the seeder; dumped beats appear in the feed immediately.
                </p>
              )}
            </>
          )}
        </section>

        <p className="mt-8 text-center text-[11px] text-muted-foreground">
          Purge removes only <code>dev-*</code> accounts (beats, events, offers cascade). Real accounts and
          shared genre tags are never touched.
        </p>
      </div>
    </div>
  )
}
