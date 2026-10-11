import Link from 'next/link'
import example from '../lib/leftover-example.json'
import { LookupForm } from '../components/lookup-form'
export default function Home() {
  return <main className="home-shell">
    <p className="brand">Keycut for Tempo</p>
    <h1>See who can spend.<br />Cut unwanted access.</h1>
    <p className="intro">Find an account’s keys, read their permissions and spot access that’s still open.</p>
    <LookupForm />
    <p className="subtext mt-5">Read-only. No wallet needed. History coverage is shown with every lookup.</p>
    <div className="mt-5"><Link className="example-link" href="/demo">Try the live demo</Link></div>
    <Link className="example-link" href={`/testnet/${example.account}`} prefetch={true}>See a leftover key</Link>
    <p className="subtext">Seeded testnet example. Not real funds. No setup needed.</p>
    <footer>Removing an admin key leaves its child keys in place. Check what can still spend.</footer>
  </main>
}
