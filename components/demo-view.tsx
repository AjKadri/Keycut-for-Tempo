'use client'
import Link from 'next/link'
import { useState } from 'react'
import { createDemo, demoAction, type DemoReady, type ActionResult } from '../lib/demo-api'
import type { DemoEvent } from '../lib/demo'
import { AccountView } from './account-view'
import example from '../lib/leftover-example.json'

const titles = ['Create the leftover key', 'Prove it can still pay', 'Revoke the child key', 'Try the payment again']
export function DemoView() {
  const [ready, setReady] = useState<DemoReady>()
  const [transactions, setTransactions] = useState<Extract<DemoEvent, { type: 'transaction' }>[]>([])
  const [results, setResults] = useState<Record<number, ActionResult>>({})
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [version, setVersion] = useState(0)
  async function run() {
    setBusy(true); setError('')
    try {
      if (!ready) {
        setTransactions([])
        await createDemo(event => {
          if (event.type === 'transaction') setTransactions(previous => [...previous, event])
          if (event.type === 'ready') { setReady(event); setStep(1); setVersion(value => value + 1) }
        })
      } else {
        const result = await demoAction(step === 2 ? 'revoke' : 'pay', ready.session)
        setResults(previous => ({ ...previous, [step]: result }))
        setReady({ ...ready, session: result.session }); setStep(step + 1); setVersion(value => value + 1)
      }
    } catch (error) { setError((error as Error).message) } finally { setBusy(false) }
  }
  async function revokeFromCard(key: string) {
    setBusy(true)
    try {
      const result = await demoAction('revoke', ready!.session, key)
      setReady(previous => previous && ({ ...previous, session: result.session }))
      if (key.toLowerCase() === ready!.child.toLowerCase()) { setResults(previous => ({ ...previous, 2: result })); setStep(3) }
      setVersion(value => value + 1)
      return result
    } finally { setBusy(false) }
  }
  const account = ready?.account
  return <main className="demo-shell">
    <header className="page-header"><Link href="/" className="brand">Keycut for Tempo</Link><Link href="/">Look up an account</Link></header>
    <p className="eyebrow">Test network 42431 · Seeded demo account · Not real funds</p>
    <h1>The agent is gone.<br />Its child key can still spend.</h1>
    <p className="intro">Removing an admin key leaves its child keys active. See the access that remains, then cut it off.</p>
    <p className="notice">This live demo creates throwaway testnet keys on the server and funds them from a testnet bank. No wallet or private key needed. Sessions expire after two hours.</p>
    <p><Link className="example-link" href={`/testnet/${example.account}`} prefetch={true}>See a leftover key</Link><span className="subtext"> · Permanent seeded testnet example, no setup</span></p>
    <div className="demo-grid">
      <section aria-label="Four live demo steps" className="demo-steps">
        {titles.map((title, index) => <article key={title} className={`demo-step ${step === index ? 'current' : ''}`}>
          <p className="eyebrow">Step {index + 1} · {step > index ? 'Complete' : step === index && busy ? 'Running' : 'Pending'}</p>
          <h2>{title}</h2>
          {index === 0 && <><p>Give an admin a child key with a 3 test AlphaUSD cap, then revoke the admin. The child stays active.</p><ul className="transaction-list">{transactions.map(tx => <li key={tx.hash}><a href={tx.url} target="_blank" rel="noreferrer">{tx.label}</a></li>)}</ul></>}
          {index === 1 && <p>{results[1]?.explanation ?? 'The child attempts a 1 test AlphaUSD payment to its allowed vendor. We compare the vendor’s balance before and after.'}</p>}
          {index === 2 && <p>{results[2]?.explanation ?? 'Revoke the child itself from this seeded account. The live account view will show the change.'}</p>}
          {index === 3 && <p>{results[3]?.explanation ?? 'Try another 1 test AlphaUSD payment. The vendor’s balance decides whether anything arrived.'}</p>}
          {results[index]?.url && <a href={results[index].url!} target="_blank" rel="noreferrer">View transaction</a>}
          {results[index]?.submission && <p className="subtext">{results[index].submission}</p>}
          {results[index]?.vendorReceived !== undefined && <p className="subtext">Vendor balance change: {results[index].vendorReceived} base units (6 decimals). Before: {results[index].before}. After: {results[index].after}.</p>}
          {step === index && <button disabled={busy} onClick={run}>{busy ? 'Waiting for the test network…' : index === 0 ? 'Create demo account' : index === 1 ? 'Make the child pay' : index === 2 ? 'Revoke the child key' : 'Attempt the payment'}</button>}
        </article>)}
        {error && <div role="alert" className="state-panel"><h2>Couldn’t confirm this step</h2><p>{error}</p><p><Link href={`/testnet/${example.account}`} prefetch={true}>See a leftover key</Link></p>{transactions.length > 0 && !ready && <p className="subtext">Setup transactions above may have completed. Reloading starts a different throwaway account.</p>}</div>}
        {step === 4 && <p className="notice" role="status">The child paid after its admin was revoked. Revoking the child stopped its next payment, confirmed by the vendor’s unchanged balance.</p>}
      </section>
      <section className="demo-live" aria-label="Actual Keycut account page">
        <h2>Live account view</h2>
        {account ? <><p className="subtext">Admin key: <code>{ready.admin}</code><br />Child key: <code>{ready.child}</code></p><Link href={`/testnet/${account}`} target="_blank">Open this account page</Link><AccountView key={account} chain="testnet" address={account} page={1} embedded refreshVersion={version} demo={{ child: ready.child, childCanRevoke: step >= 2, busy, onRevoke: revokeFromCard }} /></> : <div className="state-panel"><h3>Your account appears here</h3><p>The actual Keycut account page loads beside these steps after setup. It reads the same index, top-up and live permissions as any lookup.</p></div>}
      </section>
    </div>
    <footer>Live transactions on Tempo testnet only. Test AlphaUSD has no real value. If a transaction cannot be confirmed, the demo reports an unknown outcome.</footer>
  </main>
}
