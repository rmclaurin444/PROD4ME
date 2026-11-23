'use client'

import { useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Loader2, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TagInput } from '@/components/app/tag-input'
import { ArtworkSlot } from '@/components/app/artwork-slot'
import { validateExclusivePrice } from '@/components/app/upload'
import { readAudioDuration, uploadWithProgress, computePeaks } from '@/lib/upload-client'
import { MAX_PRICE_DOLLARS } from '@/lib/money'

const AUDIO_MAX = 250 * 1024 * 1024
const ARTWORK_MAX = 20 * 1024 * 1024
const MAX_FILES = 25

const AUDIO_EXT = new Set(['mp3', 'wav', 'aif', 'aiff', 'flac'])

async function presign(kind: 'audio' | 'artwork', file: File) {
  const res = await fetch('/api/uploads/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, contentType: file.type, size: file.size }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? 'Could not prepare upload')
  return data as { uploadUrl: string; key: string }
}

type BulkRow = {
  id: string
  file: File
  title: string
  bpm: string
  musicalKey: string
  tags: string[]
  price: number
  exclusivePrice: string
  artworkFile: File | null
  artworkPreview: string | null
  artworkPreset: string | null
  duration: number | null
  peaks: number[] | null
  status: 'pending' | 'uploading' | 'done' | 'error'
  progress: number
  error: string | null
  beatId?: string
}

function titleFromFile(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || name
}

/** Row validation — publish is blocked until every row passes. */
function rowError(row: BulkRow): string {
  if (!row.title.trim()) return 'Title is required'
  if (typeof row.price !== 'number' || row.price < 0 || row.price > MAX_PRICE_DOLLARS) {
    return `Price must be 0–${MAX_PRICE_DOLLARS}`
  }
  if (row.price > 0 && row.price < 0.5) return 'Price must be $0 (free) or at least $0.50'
  const exclusiveError = validateExclusivePrice(row.exclusivePrice, row.price)
  if (exclusiveError) return exclusiveError
  return ''
}

export function BulkUploadView() {
  const [playlistTitle, setPlaylistTitle] = useState('')
  const [playlistDescription, setPlaylistDescription] = useState('')
  const [playlistArtworkFile, setPlaylistArtworkFile] = useState<File | null>(null)
  const [playlistArtworkPreview, setPlaylistArtworkPreview] = useState<string | null>(null)
  const [playlistArtworkPreset, setPlaylistArtworkPreset] = useState<string | null>('acid')

  const [rows, setRows] = useState<BulkRow[]>([])
  const [fileErrors, setFileErrors] = useState<string[]>([])

  const [pricingMode, setPricingMode] = useState<'same' | 'individual'>('same')
  const [sharedPrice, setSharedPrice] = useState(35)
  const [sharedExclusive, setSharedExclusive] = useState('')
  const [sharedTags, setSharedTags] = useState<string[]>([])

  const [publishing, setPublishing] = useState(false)
  const [playlistId, setPlaylistId] = useState<string | null>(null)
  const [publishError, setPublishError] = useState('')
  const [publishDone, setPublishDone] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const rowArtworkInputRef = useRef<HTMLInputElement>(null)
  const rowArtworkTargetRef = useRef<string | null>(null)

  const busy = publishing
  const allValid = rows.length > 0 && rows.every(row => rowError(row) === '')

  const updateRow = (id: string, patch: Partial<BulkRow>) =>
    setRows(prev => prev.map(row => (row.id === id ? { ...row, ...patch } : row)))

  const addFiles = (files: FileList | File[]) => {
    const errors: string[] = []
    const accepted: BulkRow[] = []
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      if (!AUDIO_EXT.has(ext) && !file.type.startsWith('audio/')) {
        errors.push(`“${file.name}” isn’t an audio file (MP3, WAV, AIFF or FLAC).`)
        continue
      }
      if (file.size > AUDIO_MAX) {
        errors.push(`“${file.name}” is larger than 250MB.`)
        continue
      }
      if (rows.length + accepted.length >= MAX_FILES) {
        errors.push(`“${file.name}” skipped — max ${MAX_FILES} files per playlist.`)
        continue
      }
      accepted.push({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        title: titleFromFile(file.name),
        bpm: '',
        musicalKey: '',
        tags: [],
        price: sharedPrice,
        exclusivePrice: sharedExclusive,
        artworkFile: null,
        artworkPreview: null,
        artworkPreset: null, // no own artwork → the playlist's artwork is used
        duration: null,
        peaks: null,
        status: 'pending',
        progress: 0,
        error: null,
      })
    }
    setFileErrors(errors)
    setRows(prev => [...prev, ...accepted])
    // duration + peaks per file, same as the single-upload pipeline
    for (const row of accepted) {
      void Promise.all([readAudioDuration(row.file), computePeaks(row.file)]).then(
        ([duration, peaks]) => updateRow(row.id, { duration, peaks })
      )
    }
  }

  const removeRow = (id: string) => setRows(prev => prev.filter(row => row.id !== id))

  const moveRow = (id: string, direction: -1 | 1) =>
    setRows(prev => {
      const index = prev.findIndex(row => row.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })

  /** same → individual: prefill every row with the shared prices */
  const switchPricingMode = (mode: 'same' | 'individual') => {
    setPricingMode(mode)
    if (mode === 'individual') {
      setRows(prev =>
        prev.map(row =>
          row.status === 'done'
            ? row
            : { ...row, price: sharedPrice, exclusivePrice: sharedExclusive }
        )
      )
    }
  }

  const applySharedTags = () => {
    setRows(prev => prev.map(row => (row.status === 'done' ? row : { ...row, tags: [...sharedTags] })))
  }

  const applyPlaylistArtworkToAll = () => {
    setRows(prev =>
      prev.map(row => (row.status === 'done' ? row : { ...row, artworkFile: null, artworkPreview: null, artworkPreset: null }))
    )
  }

  const pickRowArtwork = (rowId: string) => {
    rowArtworkTargetRef.current = rowId
    rowArtworkInputRef.current?.click()
  }

  const handleRowArtwork = (file: File) => {
    const rowId = rowArtworkTargetRef.current
    if (!rowId) return
    if (file.size > ARTWORK_MAX) {
      updateRow(rowId, { error: 'Artwork is larger than 20MB' })
      return
    }
    updateRow(rowId, { artworkFile: file, artworkPreview: URL.createObjectURL(file), artworkPreset: null })
  }

  const setRowArtworkPreset = (rowId: string, presetId: string) => {
    updateRow(rowId, { artworkFile: null, artworkPreview: null, artworkPreset: presetId })
  }

  async function uploadRowArtwork(row: BulkRow): Promise<string | null> {
    if (!row.artworkFile) return null
    const { uploadUrl, key } = await presign('artwork', row.artworkFile)
    await uploadWithProgress(uploadUrl, row.artworkFile, () => {})
    return key
  }

  async function publishRow(row: BulkRow, playlistId: string, position: number) {
    updateRow(row.id, { status: 'uploading', progress: 0, error: null })

    const artKey = await uploadRowArtwork(row)
    updateRow(row.id, { progress: 10 })

    const audio = await presign('audio', row.file)
    await uploadWithProgress(audio.uploadUrl, row.file, progress => {
      // 10% artwork + 80% audio + 10% save
      updateRow(row.id, { progress: 10 + Math.round(progress * 0.8) })
    })

    const res = await fetch('/api/beats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: row.title.trim(),
        bpm: row.bpm ? Number(row.bpm) : null,
        musicalKey: row.musicalKey.trim() || null,
        price: row.price,
        exclusivePrice: row.exclusivePrice.trim() === '' ? null : Number(row.exclusivePrice),
        tags: row.tags,
        audioKey: audio.key,
        artKey,
        artPreset: artKey ? null : row.artworkPreset,
        peaks: row.peaks,
        durationSec: row.duration,
        playlistId,
        playlistPosition: position,
      }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Could not save beat')

    updateRow(row.id, { status: 'done', progress: 100, beatId: data.beat?.id })
  }

  async function publish(failedOnly = false) {
    setPublishError('')
    if (!playlistTitle.trim()) {
      setPublishError('Playlist title is required')
      return
    }

    const queue = rows.filter(row =>
      failedOnly ? row.status === 'error' : row.status !== 'done'
    )
    if (rows.some(row => rowError(row) !== '')) {
      setPublishError('Fix the highlighted rows before publishing')
      return
    }
    if (queue.length === 0) return

    setPublishing(true)
    try {
      // the playlist is created once, before its beats
      let pid = playlistId
      if (!pid) {
        let artKey: string | null = null
        let artPreset: string | null = playlistArtworkPreset
        if (playlistArtworkFile) {
          const { uploadUrl, key } = await presign('artwork', playlistArtworkFile)
          await uploadWithProgress(uploadUrl, playlistArtworkFile, () => {})
          artKey = key
          artPreset = null
        }
        const res = await fetch('/api/playlists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: playlistTitle.trim(),
            description: playlistDescription.trim() || null,
            artKey,
            artPreset,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Could not create playlist')
        pid = data.playlist.id
        setPlaylistId(pid)
      }
      if (!pid) throw new Error('Could not create playlist')
      const activePlaylistId: string = pid

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        if (row.status === 'done') continue
        if (failedOnly && row.status !== 'error') continue
        try {
          await publishRow(row, activePlaylistId, i)
        } catch (err) {
          updateRow(row.id, {
            status: 'error',
            error: err instanceof Error ? err.message : 'Upload failed',
          })
        }
      }

      const stillFailed = rows.some(row => row.status === 'error')
      if (!stillFailed) setPublishDone(true)
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Publish failed')
    } finally {
      setPublishing(false)
    }
  }

  const failedCount = rows.filter(row => row.status === 'error').length
  const doneCount = rows.filter(row => row.status === 'done').length

  if (publishDone) {
    return (
      <div className="mt-6 rounded-3xl border border-success/30 bg-success/10 p-8 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-brand text-brand-foreground">
          <Check size={28} />
        </div>
        <h2 className="mt-5 text-2xl font-black">Playlist published</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {doneCount} beat{doneCount === 1 ? '' : 's'} uploaded to “{playlistTitle.trim()}”. They are live in
          the feed and in the playlist on your profile.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      {/* ---- playlist details ---- */}
      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <label className="text-xs font-bold text-muted-foreground">
            Playlist title
            <input
              value={playlistTitle}
              onChange={e => setPlaylistTitle(e.target.value)}
              className="input mt-2"
              placeholder="e.g. November Tape Pack"
              disabled={busy}
            />
          </label>
          <label className="text-xs font-bold text-muted-foreground">
            Description (optional)
            <input
              value={playlistDescription}
              onChange={e => setPlaylistDescription(e.target.value)}
              className="input mt-2"
              placeholder="What ties these beats together?"
              disabled={busy}
            />
          </label>
        </div>
        <ArtworkSlot
          file={playlistArtworkFile}
          onFile={file => {
            if (file.size > ARTWORK_MAX) {
              setPublishError('Playlist artwork is larger than 20MB')
              return
            }
            setPublishError('')
            setPlaylistArtworkFile(file)
            setPlaylistArtworkPreview(URL.createObjectURL(file))
          }}
          previewUrl={playlistArtworkPreview}
          onClearFile={() => {
            setPlaylistArtworkFile(null)
            setPlaylistArtworkPreview(null)
          }}
          presetId={playlistArtworkFile ? null : playlistArtworkPreset}
          onPreset={presetId => {
            setPlaylistArtworkPreset(presetId)
            setPlaylistArtworkFile(null)
            setPlaylistArtworkPreview(null)
          }}
        />
      </div>

      {/* ---- files ---- */}
      <div>
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-muted-foreground">
            Files · {rows.length}/{MAX_FILES}
          </p>
          {rows.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {doneCount} uploaded{failedCount > 0 ? ` · ${failedCount} failed` : ''}
            </span>
          )}
        </div>
        <div
          onClick={() => !busy && fileInputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault()
            if (!busy && e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
          }}
          className={`mt-2 grid cursor-pointer place-items-center rounded-2xl border border-dashed p-8 transition ${
            'border-border bg-surface hover:border-brand/50'
          }`}
        >
          <div className="pointer-events-none text-center">
            <Upload className="mx-auto mb-2 text-brand" size={24} />
            <p className="text-sm font-bold">Drop audio files here</p>
            <p className="mt-1 text-xs text-muted-foreground">
              MP3, WAV, AIFF or FLAC · max 250MB each · up to {MAX_FILES} files
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/aiff,audio/x-aiff,audio/flac"
            className="hidden"
            onChange={e => {
              if (e.target.files?.length) addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
        {fileErrors.length > 0 && (
          <div className="mt-2 rounded-xl border border-error/30 bg-error/10 p-3 text-xs font-semibold text-error">
            {fileErrors.map(message => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <>
          {/* ---- pricing mode ---- */}
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-bold text-muted-foreground">Pricing mode</p>
              <div className="flex rounded-lg border border-border bg-surface-2 p-0.5">
                {(['same', 'individual'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => switchPricingMode(mode)}
                    aria-pressed={pricingMode === mode}
                    disabled={busy}
                    className={`rounded-md px-3 py-1 text-[11px] font-black ${
                      pricingMode === mode
                        ? 'bg-brand text-brand-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {mode === 'same' ? 'Same price for all' : 'Price individually'}
                  </button>
                ))}
              </div>
            </div>

            {pricingMode === 'same' && (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold text-muted-foreground">
                  Non-exclusive price{' '}
                  <span className="ml-2 rounded-full bg-brand px-2 py-1 text-[10px] text-brand-foreground">
                    {sharedPrice === 0 ? 'FREE' : `$${sharedPrice}`}
                  </span>
                  <input
                    aria-label="Shared price"
                    type="range"
                    min="0"
                    max={MAX_PRICE_DOLLARS}
                    step="5"
                    value={sharedPrice}
                    onChange={e => setSharedPrice(Number(e.target.value))}
                    className="mt-3 w-full accent-brand"
                    disabled={busy}
                  />
                  <span className="mt-1 block text-xs">{sharedPrice === 0 ? '$0 — Free' : `$${sharedPrice}`}</span>
                </label>
                <label className="text-xs font-bold text-muted-foreground">
                  Exclusive license price (optional, applies to all)
                  <input
                    aria-label="Shared exclusive price"
                    type="number"
                    min="0.5"
                    max={MAX_PRICE_DOLLARS}
                    step="0.01"
                    value={sharedExclusive}
                    onChange={e => setSharedExclusive(e.target.value)}
                    className="input mt-2"
                    placeholder="Optional — e.g. 299"
                    inputMode="decimal"
                    disabled={busy}
                  />
                  <span className="mt-1 block min-h-4 text-xs font-semibold text-error">
                    {validateExclusivePrice(sharedExclusive, sharedPrice)}
                  </span>
                </label>
              </div>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              {pricingMode === 'same'
                ? 'Every beat gets this price when published.'
                : 'Rows are pre-filled with the shared prices — adjust each one below.'}
            </p>
          </div>

          {/* ---- review rows ---- */}
          <div className="flex flex-col gap-2">
            {rows.map((row, index) => {
              const error = rowError(row)
              return (
                <div
                  key={row.id}
                  className={`rounded-2xl border p-3 ${
                    row.status === 'error'
                      ? 'border-error/40 bg-error/[.04]'
                      : row.status === 'done'
                        ? 'border-success/30 bg-success/[.04]'
                        : 'border-border bg-surface'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-col">
                      <button
                        onClick={() => moveRow(row.id, -1)}
                        disabled={busy || index === 0}
                        aria-label={`Move ${row.title} up`}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        onClick={() => moveRow(row.id, 1)}
                        disabled={busy || index === rows.length - 1}
                        aria-label={`Move ${row.title} down`}
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowDown size={13} />
                      </button>
                    </div>

                    <span className="w-5 text-center text-xs font-black tabular-nums text-muted-foreground">
                      {index + 1}
                    </span>

                    {/* artwork chip */}
                    <button
                      onClick={() => pickRowArtwork(row.id)}
                      disabled={busy || row.status === 'done'}
                      aria-label={`Set artwork for ${row.title}`}
                      title="Click to set this beat's own artwork"
                      className="size-10 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-2"
                    >
                      {row.artworkPreview ? (
                        <img src={row.artworkPreview} alt="" className="size-full object-cover" />
                      ) : row.artworkPreset ? (
                        <span className="grid size-full place-items-center text-[9px] font-black text-brand">
                          {row.artworkPreset.slice(0, 4)}
                        </span>
                      ) : (
                        <span className="grid size-full place-items-center text-[8px] font-bold text-muted-foreground">
                          playlist
                        </span>
                      )}
                    </button>

                    <input
                      value={row.title}
                      onChange={e => updateRow(row.id, { title: e.target.value })}
                      aria-label={`Title for ${row.file.name}`}
                      className="input min-w-0 flex-1 px-2 py-1.5 text-sm"
                      disabled={busy || row.status === 'done'}
                    />

                    <input
                      value={row.bpm}
                      onChange={e => updateRow(row.id, { bpm: e.target.value.replace(/\D/g, '') })}
                      aria-label={`BPM for ${row.title}`}
                      placeholder="BPM"
                      inputMode="numeric"
                      className="input w-16 px-2 py-1.5 text-center text-sm"
                      disabled={busy || row.status === 'done'}
                    />
                    <input
                      value={row.musicalKey}
                      onChange={e => updateRow(row.id, { musicalKey: e.target.value })}
                      aria-label={`Key for ${row.title}`}
                      placeholder="Key"
                      className="input w-20 px-2 py-1.5 text-sm"
                      disabled={busy || row.status === 'done'}
                    />

                    <div className="flex items-center gap-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground">
                        $
                        <input
                          aria-label={`Price for ${row.title}`}
                          type="number"
                          min="0"
                          max={MAX_PRICE_DOLLARS}
                          step="5"
                          value={row.price}
                          onChange={e => updateRow(row.id, { price: Number(e.target.value) })}
                          disabled={pricingMode === 'same' || busy || row.status === 'done'}
                          readOnly={pricingMode === 'same'}
                          className="w-16 rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm font-black tabular-nums outline-none focus:border-brand/60 disabled:opacity-60"
                        />
                      </label>
                      <input
                        aria-label={`Exclusive price for ${row.title}`}
                        type="number"
                        min="0.5"
                        max={MAX_PRICE_DOLLARS}
                        step="0.01"
                        value={row.exclusivePrice}
                        onChange={e => updateRow(row.id, { exclusivePrice: e.target.value })}
                        placeholder="excl."
                        disabled={pricingMode === 'same' || busy || row.status === 'done'}
                        readOnly={pricingMode === 'same'}
                        className="w-20 rounded-lg border border-border bg-surface-2 px-2 py-1 text-sm outline-none focus:border-brand/60 disabled:opacity-60"
                      />
                    </div>

                    {row.status !== 'done' && (
                      <button
                        onClick={() => removeRow(row.id)}
                        disabled={busy}
                        aria-label={`Remove ${row.title}`}
                        className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-2 hover:text-error disabled:opacity-40"
                      >
                        <X size={14} />
                      </button>
                    )}
                    {row.status === 'done' && <Check size={16} className="text-success" />}
                  </div>

                  {/* tags row */}
                  {row.status !== 'done' && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <TagInput
                        value={row.tags}
                        onChange={tags => updateRow(row.id, { tags })}
                      />
                    </div>
                  )}

                  {/* progress / error */}
                  {row.status === 'uploading' && (
                    <div className="mt-2">
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full bg-brand transition-all" style={{ width: `${row.progress}%` }} />
                      </div>
                    </div>
                  )}
                  {row.status === 'error' && (
                    <div className="mt-2 flex items-center gap-2 text-xs font-bold text-error">
                      {row.error}
                      <button
                        onClick={() => void publish(true)}
                        disabled={busy}
                        className="rounded-full border border-error/40 px-2.5 py-1 text-[10px] font-black hover:bg-error/10 disabled:opacity-40"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* ---- apply-to-all + publish ---- */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="text-xs font-bold text-muted-foreground">Apply to all</p>
              <div className="flex flex-wrap items-center gap-2">
                <TagInput value={sharedTags} onChange={setSharedTags} />
                <button
                  onClick={applySharedTags}
                  disabled={busy}
                  className="rounded-full border border-border px-3 py-1.5 text-[10px] font-black hover:bg-surface-2 disabled:opacity-40"
                >
                  APPLY TAGS
                </button>
                <button
                  onClick={applyPlaylistArtworkToAll}
                  disabled={busy}
                  className="rounded-full border border-border px-3 py-1.5 text-[10px] font-black hover:bg-surface-2 disabled:opacity-40"
                >
                  USE PLAYLIST ARTWORK
                </button>
              </div>
            </div>
            <Button
              onClick={() => void publish(false)}
              disabled={busy || !allValid || !playlistTitle.trim()}
              className="bg-brand font-black text-brand-foreground disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 animate-spin" size={16} /> Publishing…
                </>
              ) : (
                `Publish playlist · ${rows.length} beat${rows.length === 1 ? '' : 's'}`
              )}
            </Button>
          </div>
          {publishError && <p className="text-sm font-semibold text-error">{publishError}</p>}
          {!allValid && rows.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Publishing unlocks when every row has a title and valid prices.
            </p>
          )}
        </>
      )}

      {/* hidden input for per-row artwork */}
      <input
        ref={rowArtworkInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm"
        className="hidden"
        onChange={e => {
          const picked = e.target.files?.[0]
          if (picked) handleRowArtwork(picked)
          e.target.value = ''
        }}
      />
    </div>
  )
}
