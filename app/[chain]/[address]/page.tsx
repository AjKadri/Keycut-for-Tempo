import { isAddress, type Address } from 'viem'
import { notFound } from 'next/navigation'
import { cachedLookup } from '../../../lib/lookup'
import { AccountView } from '../../../components/account-view'
export default async function AccountPage({ params, searchParams }: {
  params: Promise<{ chain: string; address: string }>; searchParams: Promise<{ page?: string }>
}) {
  const { chain, address } = await params
  const query = await searchParams
  if (chain !== 'testnet' && chain !== 'mainnet') notFound()
  let initialData
  if (isAddress(address, { strict: false })) {
    try { initialData = await cachedLookup(chain, address as Address, Number(query.page ?? 1)) } catch { /* Client retry keeps coverage visible. */ }
  }
  return <AccountView initialData={initialData} chain={chain} address={address} page={Number(query.page ?? 1)} />
}
