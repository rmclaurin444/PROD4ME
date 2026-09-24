import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getBeats } from '@/lib/beats'
import { AppShell } from '@/components/app/app-shell'

export default async function Page() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/login')
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  })

  if (!user) {
    redirect('/login')
  }

  const beats = await getBeats()

  return (
    <AppShell
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        bio: user.bio,
        banner: user.banner,
        theme: user.theme,
      }}
      beats={beats}
    />
  )
}
