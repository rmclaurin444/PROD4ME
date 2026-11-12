import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { addToAudioPool, devPanelEnabled, dumpAudioFile } from '@/lib/dev-seed'
import { MAX_AUDIO_BYTES } from '@/lib/storage'

/** Dev panel routes exist only outside production (or with DEV_PANEL=1). */
function guard(): NextResponse | null {
  if (!devPanelEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return null
}

/**
 * Mass-dump endpoint for the /dev panel's drag-and-drop zone. One audio file
 * per request (the client loops, giving real per-file progress and avoiding
 * giant multipart bodies).
 *
 * mode=beat (default): the file becomes a fully playable beat immediately,
 *   with random metadata, tagged from the submitted genre pool.
 * mode=pool: the file is staged into the dev audio pool (`audio/dev-pool/`)
 *   for the seeder to draw from later — no beat is created.
 */
export async function POST(request: Request) {
  const blocked = guard()
  if (blocked) return blocked

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'File too large (max 250MB)' }, { status: 400 })
  }

  const genresField = form.get('genres')
  const genres =
    typeof genresField === 'string'
      ? genresField.split(',').map(g => g.trim()).filter(Boolean).slice(0, 8)
      : []

  const producerField = form.get('producerId')
  const producerId = typeof producerField === 'string' && producerField.length > 0 ? producerField : null
  const mode = form.get('mode') === 'pool' ? 'pool' : 'beat'

  try {
    const bytes = Buffer.from(await file.arrayBuffer())
    if (mode === 'pool') {
      const pooled = await addToAudioPool({ filename: file.name, contentType: file.type || null, bytes })
      return NextResponse.json({ pooled })
    }
    const result = await dumpAudioFile(
      { filename: file.name, contentType: file.type || null, bytes },
      { genres, producerId },
    )
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Dump failed'
    console.error('Dev dump error:', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
