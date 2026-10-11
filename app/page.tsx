import Link from 'next/link'
import { readFile } from 'node:fs/promises'
import type { IndexMeta } from '../lib/index'
import example from '../lib/leftover-example.json'
import { LookupForm } from '../components/lookup-form'
export const dynamic = 'force-dynamic'
export default async function Home() {
  const snapshots = await Promise.all(([42431, 4217] as const).map(async id => {
    try { return JSON.parse(await readFile(`public/index/${id}/meta.json`, 'utf8')) as IndexMeta }
    catch { return null }
  }))
  return <main className="home-shell">
    <p className="brand"><img src="/logo.svg" alt="" width="28" height="28" /> Keycut for Tempo</p>
    <h1>See who can spend.<br />Cut unwanted access.</h1>
    <p className="intro">Find an account’s keys, read their permissions and spot access that’s still open.</p>
    <LookupForm />
    <p className="subtext mt-5">Read-only. No wallet needed. History coverage is shown with every lookup.</p>
    <div className="mt-5"><Link className="example-link" href="/demo">Try the live demo</Link></div>
    <Link className="example-link" href={`/testnet/${example.account}`} prefetch={true}>See a leftover key</Link>
    <p className="subtext">Seeded testnet example. Not real funds. No setup needed.</p>
    <section className="network-snapshots" aria-label="Network snapshots">{snapshots.map((snapshot, i) => <p key={i}>{snapshot ? <>{snapshot.counts.keys.toLocaleString('en-GB')} keys across {snapshot.counts.accounts.toLocaleString('en-GB')} accounts on {i === 0 ? 'testnet' : 'mainnet'}<br /><span className="subtext">Snapshot {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(snapshot.builtAt))} UTC · through block {snapshot.completeThroughBlock.toLocaleString('en-GB')}</span></> : `Snapshot unavailable for ${i === 0 ? 'testnet' : 'mainnet'}.`}</p>)}</section>
    <footer>Removing an admin key leaves its child keys in place. Check what can still spend. No tool we found lists these keys.</footer>
  </main>
}
