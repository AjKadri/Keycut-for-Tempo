import type { Metadata } from 'next'
import '@fontsource-variable/bricolage-grotesque/standard.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './globals.css'
import { SiteLayout } from '../components/site-layout'
import { snapshots, snapshotDate } from '../lib/snapshots'
export const metadata: Metadata = { title: 'Keycut for Tempo', description: 'See who can spend. Cut unwanted access.' }
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const metas = await snapshots()
  return <html lang="en"><body><SiteLayout snapshotDate={snapshotDate(metas[0] ?? null)}>{children}</SiteLayout></body></html>
}
