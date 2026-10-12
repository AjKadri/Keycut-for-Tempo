import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { SiteLayout } from '../components/site-layout'
import { snapshots, snapshotDate } from '../lib/snapshots'

const displayFont = localFont({
  src: '../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2',
  variable: '--font-display',
  weight: '200 800',
  display: 'swap',
})
const monoFont = localFont({
  src: [
    { path: '../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2', weight: '400' },
    { path: '../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2', weight: '500' },
  ],
  variable: '--font-mono',
  display: 'swap',
})
export const metadata: Metadata = { title: 'Keycut for Tempo', description: 'See who can spend. Cut unwanted access.' }
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const metas = await snapshots()
  return <html lang="en" className={`${displayFont.variable} ${monoFont.variable}`}><body><SiteLayout snapshotDate={snapshotDate(metas[0] ?? null)}>{children}</SiteLayout></body></html>
}
