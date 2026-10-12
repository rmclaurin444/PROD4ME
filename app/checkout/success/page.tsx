import { CheckoutSuccessView } from '@/components/app/checkout-success'

export const dynamic = 'force-dynamic'

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>
}) {
  const { session_id } = await searchParams
  return <CheckoutSuccessView sessionId={session_id ?? ''} />
}
