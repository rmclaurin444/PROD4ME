import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ARTIST') {
    return NextResponse.json({ error: 'Only artists can claim free beats' }, { status: 403 })
  }

  let body: { beatId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!body.beatId) {
    return NextResponse.json({ error: 'beatId is required' }, { status: 400 })
  }

  const beat = await prisma.beat.findUnique({ where: { id: body.beatId } })
  if (!beat) {
    return NextResponse.json({ error: 'Beat not found' }, { status: 404 })
  }
  if (beat.producerId === session.user.id) {
    return NextResponse.json({ error: 'You cannot claim your own beat' }, { status: 403 })
  }
  if (beat.price !== 0) {
    return NextResponse.json({ error: 'This beat is not free' }, { status: 400 })
  }
  if (beat.exclusiveSold) {
    return NextResponse.json({ error: 'This beat is no longer available' }, { status: 409 })
  }

  try {
    const license = await prisma.license.create({
      data: {
        beatId: beat.id,
        artistId: session.user.id,
        licenseType: 'NON_EXCLUSIVE',
        pricePaidCents: 0,
      },
    })
    return NextResponse.json({ license: { id: license.id, licenseType: license.licenseType } }, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Already in your library' }, { status: 409 })
    }
    console.error('Free license error:', error)
    return NextResponse.json({ error: 'Could not claim license' }, { status: 500 })
  }
}
