import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { devPanelEnabled } from '@/lib/dev-seed'
import { DevPanel } from '@/components/dev/dev-panel'

export const dynamic = 'force-dynamic'

export default async function DevPage() {
  if (!devPanelEnabled()) notFound()

  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  return <DevPanel />
}
