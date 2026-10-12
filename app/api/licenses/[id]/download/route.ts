import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BUCKET_AUDIO, objectExists, presignAttachmentDownload } from '@/lib/storage'

function safeFilename(title: string, ext: string) {
  const base = title.replace(/[^a-zA-Z0-9 _.-]/g, '').trim().slice(0, 60) || 'beat'
  if (base.includes('.')) return base
  return `${base}.${ext}`
}

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params
  const license = await prisma.license.findUnique({
    where: { id },
    include: { beat: true },
  })
  if (!license || license.artistId !== session.user.id) {
    // don't leak whether the license exists
    return NextResponse.json({ error: 'License not found' }, { status: 404 })
  }

  const { audioKey, title } = license.beat

  if (!(await objectExists(BUCKET_AUDIO, audioKey))) {
    return NextResponse.json(
      { error: 'The audio file for this beat is missing (seeded test data has no audio)' },
      { status: 404 }
    )
  }

  const ext = audioKey.includes('.') ? audioKey.split('.').pop()!.toLowerCase() : 'mp3'
  const filename = safeFilename(title, ext)

  try {
    const downloadUrl = await presignAttachmentDownload(BUCKET_AUDIO, audioKey, 300, filename)
    return NextResponse.json({ downloadUrl, filename })
  } catch (error) {
    console.error('Download presign error:', error)
    return NextResponse.json({ error: 'Could not prepare download' }, { status: 500 })
  }
}
