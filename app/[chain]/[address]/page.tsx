import { AccountView } from '../../../components/account-view'
export default async function AccountPage({ params, searchParams }: {
  params: Promise<{ chain: string; address: string }>; searchParams: Promise<{ page?: string }>
}) {
  const { chain, address } = await params
  const query = await searchParams
  return <AccountView chain={chain} address={address} page={Number(query.page ?? 1)} />
}
