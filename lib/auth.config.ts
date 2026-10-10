import type { NextAuthConfig } from 'next-auth'

/**
 * Edge-safe auth config (no Prisma/bcrypt) — imported by proxy.ts for route protection.
 * Full auth with Credentials provider is in auth.ts.
 */
export const authConfig = {
  pages: {
    signIn: '/login',
  },
  session: {
    // JWT required for Credentials provider (no DB session table)
    strategy: 'jwt',
  },
  callbacks: {
    // Persist user fields (id, role) into the JWT on sign-in
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.name = user.name
        token.email = user.email
      }
      return token
    },
    // Expose JWT fields on the session object for client/server access
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.name = token.name as string
        session.user.email = token.email as string
      }
      return session
    },
    // Route protection: allow auth routes publicly, redirect logged-in users away from login/signup
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user
      const { pathname } = request.nextUrl

      // Auth API routes must always be accessible
      if (pathname.startsWith('/api/auth')) {
        return true
      }

      const isAuthRoute =
        pathname.startsWith('/login') || pathname.startsWith('/signup')

      if (isAuthRoute) {
        // Logged-in users shouldn't see login/signup pages
        if (isLoggedIn) {
          return Response.redirect(new URL('/', request.nextUrl))
        }
        return true
      }

      // All other routes require authentication
      return isLoggedIn
    },
  },
  // Providers defined in auth.ts (can't import Prisma/bcrypt at edge)
  providers: [],
} satisfies NextAuthConfig
