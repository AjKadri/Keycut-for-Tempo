import type { Metadata } from 'next'
import { WalletTest } from '../../components/wallet-test'
export const metadata: Metadata = { title: 'Tempo wallet gate | Keycut', robots: { index: false, follow: false } }
export default function Page() { return <WalletTest /> }
