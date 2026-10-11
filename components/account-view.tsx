'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { fetchKeys, type KeysResult } from '../lib/keys-api'
import { permissionSummaries } from '../lib/permission-summary'
import example from '../lib/leftover-example.json'
import { KeyCard } from './key-card'

export function AccountView({ chain, address, page, initialData }: { chain: string; address: string; page: number; initialData?: KeysResult }) {
  const [state, setState] = useState<{ id: string; data?: KeysResult; error?: string }>({ id: initialData ? `${chain}:${address}:${page}:0` : '', data: initialData })
  const [attempt, setAttempt] = useState(0)
  const id = `${chain}:${address}:${page}:${attempt}`
  const current = state.id === id ? state : undefined
  const data = current?.data, error = current?.error, loading = !data && !error
  useEffect(() => {
    if (attempt === 0 && initialData) setState({ id, data: initialData })
    const controller = new AbortController()
    fetchKeys(chain, address, page, controller.signal).then(data => setState({ id, data }), error => {
      if (!controller.signal.aborted) setState({ id, error: error.message })
    })
    return () => controller.abort()
  }, [chain, address, page, id, initialData, attempt])
  const href = (value: number) => `/${chain}/${address}?page=${value}`
  return <main className="account-shell">
    <header className="page-header"><Link href="/" className="brand">Keycut for Tempo</Link><Link href="/">Look up another account</Link></header>
    <p className="eyebrow">{chain === 'mainnet' ? 'Mainnet · read only' : chain === 'testnet' ? 'Testnet · Moderato' : 'Unknown network'}</p>
    <h1>Account keys</h1>
    {chain === 'testnet' && address.toLowerCase() === example.account.toLowerCase() && <div className="notice"><p>Seeded demo account on the test network. Not real funds.</p><p>The admin key was revoked. Its child still has a small spending cap and remains active until its expiry. This relationship is known from this demo’s setup, not inferred from key events.</p><p>Admin: <code>{example.admin}</code><br />Child: <code>{example.child}</code></p><details><summary>Setup transactions</summary>{(example.transactions as { hash: string; url: string; label: string }[]).map(tx => <p key={tx.hash}><a href={tx.url} target="_blank" rel="noreferrer">{tx.label}</a></p>)}</details></div>}<p className="account-address">{address}</p>
    <div className="coverage" role="status" aria-live="polite">
      {data ? <><p>{data.coverageSentence}</p><span className="subtext">Live permissions at block {data.permissionsAtBlock.toLocaleString()} · Checked {new Date(data.checkedAt).toLocaleString()}. Caps cover known stablecoins only.</span></> : <p>{loading ? 'Coverage pending. Checking indexed history and topping up to the latest block…' : 'Coverage unavailable. This lookup did not return a result.'}</p>}
    </div>
    <section aria-busy={loading}>
      {loading && <div className="state-panel" role="status"><div className="loader" /><h2>Finding keys and reading permissions</h2><p>Checking indexed history and live chain permissions. RPC delays can make a lookup take longer.</p></div>}
      {error && <div className="state-panel" role="alert"><h2>Couldn’t load these keys</h2><p>{error}</p><button onClick={() => setAttempt(value => value + 1)}>Try again</button></div>}
      {data && <>
        {!data.complete && <div className="state-panel partial"><h2>Partial result</h2><p>{!data.discoveryComplete ? 'Some history could not be scanned. More keys may exist in the missing ranges listed above.' : 'History was scanned, but some live permissions could not be read.'}</p><button onClick={() => setAttempt(value => value + 1)}>Retry lookup</button></div>}
        <div className="results-heading"><h2>{data.totalKeys.toLocaleString()} keys found</h2><span>On this page: {data.keys.filter(key => key.status === 'active').length} active · {data.keys.filter(key => key.riskFlags.length).length} flagged</span></div>
        {permissionSummaries(data.keys, data.permissionsAtTimestamp).map(summary => <p key={summary} className="notice mb-5">{summary}</p>)}
        {data.keys.length === 0 ? <div className="state-panel"><h2>{data.totalKeys ? 'No keys on this page' : data.discoveryComplete ? 'No keys found' : 'No keys found in the covered history'}</h2><p>{data.totalKeys ? 'Choose a page within the available range.' : 'This account has no key events in the covered block ranges.'}</p></div> : <div className="key-list">{data.keys.map(entry => <KeyCard key={entry.key} entry={entry} nowSeconds={data.permissionsAtTimestamp} />)}</div>}
        {data.totalPages > 0 && <nav className="pagination" aria-label="Key pages">
          <div className="page-links">{page > 1 && <><Link href={href(1)}>First</Link><Link href={href(page - 1)}>Previous</Link></>}{page < data.totalPages && <><Link href={href(page + 1)}>Next</Link><Link href={href(data.totalPages)}>Last</Link></>}</div>
          <form action={`/${chain}/${address}`}><label htmlFor="page">Page</label><input id="page" name="page" type="number" min="1" max={data.totalPages} defaultValue={page} key={page} required /><span>of {data.totalPages.toLocaleString()}</span><button>Go</button></form>
        </nav>}
      </>}
    </section>
    <footer>Read-only lookups. No wallet needed. Revoking an admin key doesn’t revoke the keys it authorised. No tool we found lists these keys.</footer>
  </main>
}
