import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { authConfig } from '@/lib/auth.config'
import { normalizePhone } from '@/lib/username'
import { checkRateLimit } from '@/lib/rate-limit'

/**
 * Login rate limiting: 10 attempts per 15 minutes per identifier, stored in
 * Postgres (lib/rate-limit.ts) so it survives restarts and deploys.
 */
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const MAX_LOGIN_ATTEMPTS = 10

async function loginRateLimited(identifier: string) {
  const { ok } = await checkRateLimit(`login:${identifier}`, MAX_LOGIN_ATTEMPTS, LOGIN_WINDOW_MS)
  return !ok
}

/**
 * Credentials login with email, username, or phone:
 *  - contains `@` → email
 *  - starts with `+` or mostly digits → phone (E.164 normalized; only counts
 *    when `phoneVerifiedAt` is set)
 *  - otherwise → username
 * Any failure returns null so the UI shows one generic error without
 * revealing which part was wrong or whether the account exists.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        identifier: { label: 'Email, username, or phone', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const identifier =
          typeof credentials?.identifier === 'string' ? credentials.identifier.trim().toLowerCase() : ''
        const password = typeof credentials?.password === 'string' ? credentials.password : ''
        if (!identifier || !password) return null
        if (await loginRateLimited(identifier)) return null

        let user: {
          id: string
          email: string
          name: string
          role: string
          password: string
          phoneVerifiedAt: Date | null
          emailVerifiedAt: Date | null
        } | null = null

        if (identifier.includes('@')) {
          user = await prisma.user.findUnique({ where: { email: identifier } })
        } else if (identifier.startsWith('+') || /^[\d\s().-]{7,}$/.test(identifier)) {
          const phone = normalizePhone(identifier)
          if (phone) {
            const byPhone = await prisma.user.findUnique({ where: { phone } })
            // phone login only for verified numbers
            if (byPhone && byPhone.phoneVerifiedAt) user = byPhone
          }
        } else {
          user = await prisma.user.findUnique({ where: { username: identifier } })
        }

        if (!user) return null
        const passwordsMatch = await bcrypt.compare(password, user.password)
        if (!passwordsMatch) return null

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          emailVerified: !!user.emailVerifiedAt,
        }
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.name = user.name
        token.email = user.email
        token.emailVerified = Boolean((user as { emailVerified?: boolean }).emailVerified)
      }
      if (trigger === 'update' && token.id) {
        // The server re-reads the verification state from the database —
        // never trust a value sent by the client.
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { emailVerifiedAt: true, email: true, name: true },
        })
        if (dbUser) {
          token.emailVerified = !!dbUser.emailVerifiedAt
          token.email = dbUser.email
          token.name = dbUser.name
        }
      }
      return token
    },
  },
})
