import Link from 'next/link'
import { LookupForm } from '../components/lookup-form'
export default function Home() {
  return <main className="home-shell">
    <p className="brand">Keycut for Tempo</p>
    <h1>See who can spend.<br />Cut unwanted access.</h1>
    <p className="intro">Find an account’s keys, read their permissions and spot access that’s still open.</p>
    <LookupForm />
    <p className="subtext mt-5">Read-only. No wallet needed. History coverage is shown with every lookup.</p>
    <Link className="example-link" href="/testnet/0x907B843c995E9332caf4A0A832B2B1fbCD1E9477">View the seeded testnet example →</Link>
    <footer>Removing an admin key leaves its child keys in place. Check what can still spend.</footer>
  </main>
}
