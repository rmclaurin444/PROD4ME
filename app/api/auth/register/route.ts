import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { normalizeGenres, getOrCreateGenreTags, incrementGenreInterestCounts } from '@/lib/tags'
import { normalizePhone, phoneError, usernameValidationError, normalizeUsername } from '@/lib/username'
import { issueVerificationToken } from '@/lib/verification-token'
import { EMAIL_TEMPLATES, sendEmail } from '@/lib/email'
import { getAppUrl } from '@/lib/app-url'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, email, password, role, genres, username, phone } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    if (role !== 'PRODUCER' && role !== 'ARTIST') {
      return NextResponse.json({ error: 'You must select a role: Producer or Artist' }, { status: 400 })
    }

    const uErr = typeof username !== 'string' ? 'Username is required' : usernameValidationError(username)

    if (uErr) {
      return NextResponse.json({ error: uErr }, { status: 400 })
    }
    const normalizedUsername = normalizeUsername(username)

    let normalizedPhone: string | null = null
    if (phone !== undefined && phone !== null && String(phone).trim() !== '') {
      const pErr = phoneError(String(phone))
      if (pErr) return NextResponse.json({ error: pErr }, { status: 400 })
      normalizedPhone = normalizePhone(String(phone))
    }

    const emailLower = email.toLowerCase()

    const [existingUser, existingUsername, existingPhone] = await Promise.all([
      prisma.user.findUnique({ where: { email: emailLower } }),
      prisma.user.findUnique({ where: { username: normalizedUsername } }),
      normalizedPhone ? prisma.user.findUnique({ where: { phone: normalizedPhone } }) : Promise.resolve(null),
    ])

    if (existingUser) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 400 })
    }
    if (existingUsername) {
      return NextResponse.json({ error: 'That username is taken' }, { status: 400 })
    }
    if (existingPhone) {
      return NextResponse.json({ error: 'An account with this phone already exists' }, { status: 400 })
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
        email: emailLower,
        password: hashedPassword,
        role,
        username: normalizedUsername,
        phone: normalizedPhone,
        bio: role === 'PRODUCER' ? 'Producer on PROD4ME.' : 'Artist on PROD4ME.',
        ...(genreTagIds.length > 0 && {
          interests: { connect: genreTagIds.map(id => ({ id })) },
        }),
      },
    })

    await incrementGenreInterestCounts(genreTagIds)

    // email verification: required before the app can be used
    const token = await issueVerificationToken(
      user.id,
      'EMAIL_VERIFY',
      user.email,
      24 * 60 * 60 * 1000
    )
    const link = `${getAppUrl()}/verify-email?token=${token}`
    try {
      await sendEmail({ to: user.email, ...EMAIL_TEMPLATES.verifyEmail(link) })
    } catch (error) {
      console.error('Verification email error:', error)
      // the console fallback in dev already logs the link; production users
      // can resend from the pending screen
    }

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
