import type { Address } from 'viem'
import example from '../../../lib/leftover-example.json'
import { cachedLookup } from '../../../lib/lookup'
import { AccountView } from '../../../components/account-view'
export default async function AccountPage({ params, searchParams }: {
  params: Promise<{ chain: string; address: string }>; searchParams: Promise<{ page?: string }>
}) {
  const { chain, address } = await params
  const query = await searchParams
  let initialData
  if (chain === 'testnet' && example.account && address.toLowerCase() === example.account.toLowerCase()) {
    try { initialData = await cachedLookup('testnet', address as Address, Number(query.page ?? 1)) } catch { /* Client retry keeps coverage visible. */ }
  }
  return <AccountView initialData={initialData} chain={chain} address={address} page={Number(query.page ?? 1)} />
}
