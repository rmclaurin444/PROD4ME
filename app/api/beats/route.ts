/**
 * Beats API.
 * GET: List all beats (shaped for feed consumption).
 * POST: Create a new beat (producers only). Audio/artwork already uploaded via presign.
 */
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { beatInclude, getBeats } from '@/lib/beats'

/** Convert tag name to URL-safe slug */
function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Validate waveform peaks array: 1-256 numbers, each 0–1 */
function isValidPeaks(p: unknown): p is number[] {
  return (
    Array.isArray(p) &&
    p.length > 0 &&
    p.length <= 256 &&
    p.every(
      (v: unknown) =>
        typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1
    )
  )
}

export async function GET() {
  const beats = await getBeats()
  return NextResponse.json({ beats })
}

export async function POST(request: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (session.user.role !== 'PRODUCER') {
    return NextResponse.json({ error: 'Only producers can upload beats' }, { status: 403 })
  }

  let body: {
    title?: string
    bpm?: number | null
    musicalKey?: string | null
    price?: number
    tags?: string[]
    audioKey?: string
    artKey?: string | null
    artPreset?: string | null
    peaks?: number[]
    durationSec?: number | null
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { title, bpm, musicalKey, price, tags, audioKey, artKey, artPreset, peaks, durationSec } = body

  if (!title || title.trim().length === 0) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  if (!audioKey) {
    return NextResponse.json({ error: 'Audio file is required' }, { status: 400 })
  }

  if (typeof price !== 'number' || price < 0 || price > 600) {
    return NextResponse.json({ error: 'Price must be between 0 and 600' }, { status: 400 })
  }

  // Dedupe, lowercase, limit to 8 tags of max 24 chars each
  const cleanTags = Array.from(
    new Set(
      (tags ?? [])
        .map(t => t.trim().toLowerCase())
        .filter(t => t.length > 0 && t.length <= 24)
    )
  ).slice(0, 8)

  try {
    const beat = await prisma.beat.create({
      data: {
        title: title.trim(),
        bpm: typeof bpm === 'number' ? bpm : null,
        musicalKey: musicalKey?.trim() || null,
        price,
        audioKey,
        artKey: artKey ?? null,
        artUrl: null,
        artPreset: artPreset ?? null,
        peaks: isValidPeaks(peaks) ? peaks : Prisma.JsonNull,
        durationSec: typeof durationSec === 'number' ? durationSec : null,
        producerId: session.user.id,
        tags: {
          connectOrCreate: cleanTags.map(name => ({
            where: { slug: slugify(name) },
            create: { name, slug: slugify(name) },
          })),
        },
      },
      include: beatInclude,
    })

    // Increment useCount for all tags linked to this beat (powers autocomplete ranking)
    const createdTags = await prisma.tag.findMany({
      where: { beats: { some: { id: beat.id } } },
      select: { id: true },
    })
    for (const tag of createdTags) {
      await prisma.tag.update({
        where: { id: tag.id },
        data: { useCount: { increment: 1 } },
      })
    }

    return NextResponse.json({ beat }, { status: 201 })
  } catch (error) {
    console.error('Beat create error:', error)
    return NextResponse.json({ error: 'Could not save beat' }, { status: 500 })
  }
}
