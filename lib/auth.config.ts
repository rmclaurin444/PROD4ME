import type { NextAuthConfig } from 'next-auth'

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.name = user.name
        token.email = user.email
      }
      return token
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.name = token.name as string
        session.user.email = token.email as string
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
        pathname.startsWith('/login') || pathname.startsWith('/signup')

      if (isAuthRoute) {
        if (isLoggedIn) {
          return Response.redirect(new URL('/', request.nextUrl))
        }
        return true
      }

      return isLoggedIn
    },
  },
  providers: [],
} satisfies NextAuthConfig
