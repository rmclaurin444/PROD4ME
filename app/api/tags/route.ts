import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = (searchParams.get('q') ?? '').trim().toLowerCase()
  const typeParam = searchParams.get('type')

  const session = await auth()

  // Genre browsing must work pre-login (signup genre step suggests popular
  // genres), so unauthenticated requests are allowed only when explicitly
  // scoped to genres. Everything else stays auth-gated.
  if (!session?.user?.id && typeParam !== 'genre') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const where: {
    name?: { contains: string; mode: 'insensitive' }
    type?: 'GENRE' | 'STYLE'
  } = {}

  if (query) {
    where.name = { contains: query, mode: 'insensitive' }
  }

  if (typeParam === 'genre') {
    where.type = 'GENRE'
  }

  // With a query: beat-tag popularity ranks first (existing autocomplete
  // behavior). Without one (e.g. popular genres for signup): user interest
  // popularity ranks first.
  const orderBy = query
    ? [{ useCount: 'desc' as const }, { name: 'asc' as const }]
    : [{ interestCount: 'desc' as const }, { useCount: 'desc' as const }, { name: 'asc' as const }]

  const tags = await prisma.tag.findMany({
    where,
    orderBy,
    take: query ? 8 : 12,
    select: {
      id: true,
      name: true,
      slug: true,
      useCount: true,
      interestCount: true,
      type: true,
    },
  })

  return NextResponse.json({ tags })
}
