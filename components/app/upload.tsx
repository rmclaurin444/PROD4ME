'use client'

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TagInput } from '@/components/app/tag-input'
import { ArtworkSlot } from '@/components/app/artwork-slot'
import { AudioDropzone } from '@/components/app/audio-dropzone'
import { readAudioDuration, uploadWithProgress, computePeaks } from '@/lib/upload-client'

const AUDIO_MAX = 250 * 1024 * 1024
const ARTWORK_MAX = 20 * 1024 * 1024

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

export function UploadView() {
  const [title, setTitle] = useState('')
  const [bpm, setBpm] = useState('')
  const [musicalKey, setMusicalKey] = useState('')
  const [price, setPrice] = useState(35)
  const [tags, setTags] = useState<string[]>([])

  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [audioDuration, setAudioDuration] = useState<number | null>(null)
  const [audioPeaks, setAudioPeaks] = useState<number[] | null>(null)

  const [artworkFile, setArtworkFile] = useState<File | null>(null)
  const [artworkPreview, setArtworkPreview] = useState<string | null>(null)
  const [artworkPreset, setArtworkPreset] = useState<string | null>('acid')

  const [stage, setStage] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const busy = stage !== null

  const handleAudio = async (file: File) => {
    setError('')
    if (file.size > AUDIO_MAX) {
      setError('Audio file is larger than 250MB')
      return
    }
    setAudioFile(file)
    const [d, peaks] = await Promise.all([readAudioDuration(file), computePeaks(file)])
    setAudioDuration(d)
    setAudioPeaks(peaks)
  }

  const handleArtwork = (file: File) => {
    setError('')
    if (file.size > ARTWORK_MAX) {
      setError('Artwork is larger than 20MB')
      return
    }
    setArtworkFile(file)
    setArtworkPreview(URL.createObjectURL(file))
  }

  const reset = () => {
    setTitle('')
    setBpm('')
    setMusicalKey('')
    setPrice(35)
    setTags([])
    setAudioFile(null)
    setAudioDuration(null)
    setAudioPeaks(null)
    setArtworkFile(null)
    setArtworkPreview(null)
    setArtworkPreset('acid')
    setProgress(0)
    setDone(false)
  }

  const handlePublish = async () => {
    setError('')

    if (!title.trim()) {
      setError('Beat title is required')
      return
    }
    if (!audioFile) {
      setError('Add an audio file')
      return
    }

    try {
      let artKey: string | null = null

      if (artworkFile) {
        setStage('Uploading artwork')
        setProgress(0)
        const { uploadUrl, key } = await presign('artwork', artworkFile)
        await uploadWithProgress(uploadUrl, artworkFile, setProgress)
        artKey = key
      }

      setStage('Uploading audio')
      setProgress(0)
      const audio = await presign('audio', audioFile)
      await uploadWithProgress(audio.uploadUrl, audioFile, setProgress)

      setStage('Saving beat')
      const res = await fetch('/api/beats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          bpm: bpm ? Number(bpm) : null,
          musicalKey: musicalKey.trim() || null,
          price,
          tags,
          audioKey: audio.key,
          artKey,
          artPreset: artKey ? null : artworkPreset,
          peaks: audioPeaks,
          durationSec: audioDuration,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Could not save beat')

      setStage(null)
      setDone(true)
    } catch (e: any) {
      setStage(null)
      setError(e?.message ?? 'Upload failed')
    }
  }

  if (done) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-5 pb-28 pt-24 md:px-12">
        <div className="rounded-3xl border border-lime-300/30 bg-lime-300/[.06] p-8 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-lime-300 text-black">
            <Check size={28} />
          </div>
          <h1 className="mt-5 text-2xl font-black">Beat published</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your beat is now discoverable in the feed.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button onClick={reset} className="bg-lime-300 font-black text-black">
              Upload another
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-5 pb-28 pt-24 md:px-12">
      <p className="text-xs font-bold uppercase tracking-widest text-lime-300">Creator studio</p>
      <h1 className="mt-2 text-4xl font-black">Upload a new beat</h1>

      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <AudioDropzone
            file={audioFile}
            onFile={handleAudio}
            onClear={() => {
              setAudioFile(null)
              setAudioDuration(null)
              setAudioPeaks(null)
            }}
            durationSec={audioDuration}
            disabled={busy}
          />

          <ArtworkSlot
            file={artworkFile}
            onFile={handleArtwork}
            previewUrl={artworkPreview}
            onClearFile={() => {
              setArtworkFile(null)
              setArtworkPreview(null)
            }}
            presetId={artworkPreset}
            onPreset={setArtworkPreset}
          />
        </div>

        <div className="flex flex-col gap-4">
          <label className="text-xs font-bold text-muted-foreground">
            Beat title
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="input mt-2"
              placeholder="e.g. Late Checkout"
              disabled={busy}
            />
          </label>

          <div>
            <p className="mb-2 text-xs font-bold text-muted-foreground">Tags</p>
            <TagInput value={tags} onChange={setTags} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-bold text-muted-foreground">
              BPM
              <input
                value={bpm}
                onChange={e => setBpm(e.target.value.replace(/\D/g, ''))}
                className="input mt-2"
                placeholder="76"
                inputMode="numeric"
                disabled={busy}
              />
            </label>
            <label className="text-xs font-bold text-muted-foreground">
              Key
              <input
                value={musicalKey}
                onChange={e => setMusicalKey(e.target.value)}
                className="input mt-2"
                placeholder="F# minor"
                disabled={busy}
              />
            </label>
          </div>

          <label className="text-xs font-bold text-muted-foreground">
            Price{' '}
            <span className="ml-2 rounded-full bg-lime-300 px-2 py-1 text-[10px] text-black">
              {price === 0 ? 'FREE' : `$${price}`}
            </span>
            <input
              aria-label="Beat price"
              type="range"
              min="0"
              max="600"
              step="5"
              value={price}
              onChange={e => setPrice(Number(e.target.value))}
              className="mt-4 w-full accent-lime-300"
              disabled={busy}
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              {price === 0 ? '$0 — Free' : `$${price}`}
            </span>
          </label>

          {busy && (
            <div>
              <div className="flex justify-between text-xs font-bold">
                <span>{stage}</span>
                <span>{progress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-lime-300 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm font-semibold text-red-400">{error}</p>}

          <Button
            onClick={handlePublish}
            disabled={busy}
            className="bg-lime-300 font-black text-black disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 animate-spin" size={16} /> Uploading…
              </>
            ) : (
              'Publish beat'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
