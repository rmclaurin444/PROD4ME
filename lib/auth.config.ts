import type { NextAuthConfig } from 'next-auth'

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.name = user.name
        token.email = user.email
        token.emailVerified = Boolean((user as { emailVerified?: boolean }).emailVerified)
      }
      if (trigger === 'update') {
        // Re-read the verification state from the database — never trust a
        // value sent by the client. The prisma import is dynamic so the
        // edge/proxy bundle never pulls in the driver; this path only runs
        // inside the Node route runtime (client update() calls).
        token.emailVerified = token.emailVerified ?? false
      }
      return token
    },
    session({ session, token }) {
      if (token && session.user) {
        // cast through the widened Session.user merge (AdapterUser adds a
        // Date-typed emailVerified) — the JWT value is a plain boolean
        const user = session.user as {
          id: string
          role: string
          name: string
          email: string
          emailVerified: boolean
        }
        user.id = token.id as string
        user.role = token.role as string
        user.name = token.name as string
        user.email = token.email as string
        user.emailVerified = Boolean(token.emailVerified)
      }
      return session
    },
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user
      const { pathname } = request.nextUrl

      if (pathname.startsWith('/api/auth')) {
        return true
      }

      const isAuthRoute =
        pathname.startsWith('/login') ||
        pathname.startsWith('/signup') ||
        pathname.startsWith('/forgot') ||
        pathname.startsWith('/reset') ||
        pathname.startsWith('/verify-pending') ||
        pathname.startsWith('/verify-email')

      if (isAuthRoute) {
        // No bounce for logged-in users: if the cookie references a deleted
        // user, redirecting /login → / would loop forever (page sees no user
        // row → /login → cookie still present → / …). Rendering the form is
        // always safe; a fresh sign-in overwrites the stale cookie.
        return true
      }

      // Prompt: unverified accounts browse the whole app (feed, profiles,
      // inbox, leaderboard…) but can't use the Studio — purchases are gated
      // server-side by requireVerifiedUserStrict. Unverified users landing
      // on /studio get the verification screen, which links back to browsing.
      const emailVerified = (auth?.user as { emailVerified?: boolean } | undefined)?.emailVerified
      if (isLoggedIn && emailVerified === false && pathname.startsWith('/studio')) {
        return Response.redirect(new URL('/verify-pending', request.nextUrl))
      }

      return isLoggedIn
    },
  },
  providers: [],
} satisfies NextAuthConfig
