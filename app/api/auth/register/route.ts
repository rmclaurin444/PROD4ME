import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { normalizeGenres, getOrCreateGenreTags, incrementGenreInterestCounts } from '@/lib/tags'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, email, password, role, genres } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { error: 'A valid email is required' },
        { status: 400 }
      )
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      )
    }

    if (role !== 'PRODUCER' && role !== 'ARTIST') {
      return NextResponse.json(
        { error: 'You must select a role: Producer or Artist' },
        { status: 400 }
      )
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 400 }
      )
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    // Optional genre interests (signup shows this step to artists only, but
    // the API accepts them for any role). Validated + fetched-or-created
    // before the user so the transaction below only links existing rows.
    const { genres: normalizedGenres, error: genreError } = normalizeGenres(genres)
    if (genreError) {
      return NextResponse.json({ error: genreError }, { status: 400 })
    }
    const genreTags = await getOrCreateGenreTags(normalizedGenres)
    const genreTagIds = genreTags.map(tag => tag.id)

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase(),
        password: hashedPassword,
        role,
        bio:
          role === 'PRODUCER'
            ? 'Producer on PROD4ME.'
            : 'Artist on PROD4ME.',
        ...(genreTagIds.length > 0 && {
          interests: { connect: genreTagIds.map(id => ({ id })) },
        }),
      },
    })

    await incrementGenreInterestCounts(genreTagIds)

    return NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}
