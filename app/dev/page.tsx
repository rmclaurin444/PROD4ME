import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { isAdmin } from '@/lib/admin'
import { devPanelEnabled } from '@/lib/dev-seed'
import { DevPanel } from '@/components/dev/dev-panel'

export const dynamic = 'force-dynamic'

/**
 * Admin-only page. Logged-out users go to /login; logged-in non-admins get a
 * 404. Admins always have access — including in production, where the page
 * shows the admin Analytics area (the dev tools additionally require
 * `devPanelEnabled()`).
 */
export default async function DevPage() {
  const session = await auth()

  if (!session?.user?.id) {
    redirect('/login')
  }

  if (!isAdmin(session.user.email)) {
    notFound()
  }

  return <DevPanel devTools={devPanelEnabled()} />
}
