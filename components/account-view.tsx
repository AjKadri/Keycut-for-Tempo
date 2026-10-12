'use client'
import { keySummary } from '../lib/key-summary'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { fetchKeys, type KeysResult } from '../lib/keys-api'
import { pageVerdict, sortPageKeys, spendingAccess } from '../lib/key-presentation'
import type { ActionResult } from '../lib/demo-api'
import { permissionSummaries } from '../lib/permission-summary'
import example from '../lib/leftover-example.json'
import { cut, toast } from '../lib/motion'
import { KeyCard } from './key-card'

export type DemoControls = { child: string; childCanRevoke: boolean; busy: boolean; onRevoke: (key: string) => Promise<ActionResult> }
export function AccountView({ chain, address, page, initialData, demo, refreshVersion = 0, embedded = false }: { chain: string; address: string; page: number; initialData?: KeysResult; demo?: DemoControls; refreshVersion?: number; embedded?: boolean }) {
  const [state, setState] = useState<{ id: string; data?: KeysResult; error?: string }>({ id: initialData ? `${chain}:${address}:${page}:0:${refreshVersion}` : '', data: initialData })
  const [action, setAction] = useState<{ result?: ActionResult; error?: string; pending?: string }>({})
  const [attempt, setAttempt] = useState(0)
  const id = `${chain}:${address}:${page}:${attempt}:${refreshVersion}`
  const current = state.id === id ? state : undefined
  const data = current?.data, error = current?.error, loading = !data && !error
  useEffect(() => {
    if (attempt === 0 && refreshVersion === 0 && initialData) setState({ id, data: initialData })
    const controller = new AbortController()
    fetchKeys(chain, address, page, controller.signal).then(data => setState({ id, data }), error => {
      if (!controller.signal.aborted) setState({ id, error: error.message })
    })
    return () => controller.abort()
  }, [chain, address, page, id, initialData, attempt, refreshVersion])
  const href = (value: number) => `/${chain}/${address}?page=${value}`
  const [filter, setFilter] = useState('all')
  const [pendingKey, setPendingKey] = useState<string>()
  const dialog = useRef<HTMLDialogElement>(null), tabs = useRef<HTMLDivElement>(null)
  const cutController = useRef(new AbortController())
  useEffect(() => () => cutController.current.abort(), [])
  const [indexedBlock, setIndexedBlock] = useState<number>()
  useEffect(() => { const controller = new AbortController(); fetch(`/index/${chain === 'mainnet' ? 4217 : 42431}/meta.json`, { signal: controller.signal }).then(r => r.json()).then(meta => setIndexedBlock(meta.completeThroughBlock)).catch(() => {}); return () => controller.abort() }, [chain])
  useEffect(() => { const place = () => { const button = tabs.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]'), indicator = tabs.current?.querySelector<HTMLElement>('.ind'); if (button && indicator) { indicator.style.width = `${button.offsetWidth}px`; indicator.style.transform = `translateX(${button.offsetLeft}px)` } }; place(); document.fonts.ready.then(place); window.addEventListener('resize',place); return () => window.removeEventListener('resize',place) }, [filter,data])
  useEffect(() => { if (pendingKey) dialog.current?.showModal(); else dialog.current?.close() }, [pendingKey])
  async function revoke(key: string) {
    setAction({ pending: key }); setPendingKey(undefined)
    try {
      const result = await demo!.onRevoke(key)
      // The API has independently checked getKey. Animate only a confirmed revoke.
      const card = document.getElementById(`key-${key}`)
      if (card) await cut(card, { signal: cutController.current.signal })
      setAction({ result }); setAttempt(value => value + 1); toast(result.explanation)
    } catch (error) { setAction({ error: (error as Error).message }) }
  }
  const Container = embedded ? 'section' : 'main'
  const permanent = chain === 'testnet' && address.toLowerCase() === example.account.toLowerCase()
  const child = demo?.child ?? (permanent ? example.child : undefined)
  const counts = { all: data?.keys.length ?? 0, active: data?.keys.filter(key => key.status === 'active').length ?? 0, revoked: data?.keys.filter(key => key.status === 'revoked').length ?? 0, expired: data?.keys.filter(key => key.status === 'expired').length ?? 0 }
  const spenders = data?.keys.filter(key => key.status === 'active' && key.raw && spendingAccess(key.raw) === 'allowed').length ?? 0
  const selected = data?.keys.find(entry => entry.key === pendingKey)
  return <Container className={`wrap acct ${embedded ? 'embedded-account' : ''}`}>
    <div className="who"><span>{chain === 'mainnet' ? 'Mainnet account · read only' : 'Testnet account'}</span><span className="addr">{address}</span><button className="icon-btn" onClick={async () => { try { await navigator.clipboard.writeText(address); toast('Address copied') } catch { toast('Couldn’t copy the address') } }}>Copy</button><a className="icon-btn" target="_blank" rel="noreferrer" href={`https://explore.${chain === 'mainnet' ? 'mainnet' : 'testnet'}.tempo.xyz/address/${address}`}>Open in explorer</a></div>
    <div className="coverage" role="status" aria-live="polite">
      {data ? <p>{data.coverageSentence}</p> : <><p>{loading ? 'Coverage pending. Checking indexed history and the latest blocks.' : 'Coverage unavailable. This lookup did not return a result.'}</p>{indexedBlock !== undefined && <p>Index covers blocks 0 to {indexedBlock.toLocaleString()}. Live top-up is {loading ? 'pending' : 'unavailable'}.</p>}</>}
    </div>
    {loading && <div className="scan"><div className="track"><div className="fill pending" /></div><div className="lbl"><span>Reading this account’s key history and permissions</span><span>{indexedBlock !== undefined ? `Indexed through block ${indexedBlock.toLocaleString()}` : 'Loading index coverage'}</span></div></div>}
    <h1 className={`big-verdict ${data && !counts.active && data.complete ? 'safe' : ''}`} key={data?.checkedAt}>{data ? `${!data.discoveryComplete ? 'At least ' : ''}${pageVerdict(data.keys, data.permissionsAtTimestamp, data.totalPages > 1)}` : loading ? 'Checking this page’s keys' : 'Key permissions unavailable'}</h1>
    <p className="sub">{data ? `${data.totalKeys.toLocaleString()} keys found. On this page: ${counts.active} active, ${counts.revoked} revoked, ${counts.expired} expired.` : 'Looking is read-only. No wallet needed.'}</p>
    {permanent && <details className="seed-note"><summary>Seeded demo account on the test network. Not real funds.</summary><p>The admin key was revoked. This relationship is known from the demo’s setup, not inferred from key events.</p><p>Admin: <code>{example.admin}</code><br />Child: <code>{example.child}</code></p>{example.transactions.map(tx => <p key={tx.hash}><a href={tx.url} target="_blank" rel="noreferrer">{tx.label}</a></p>)}</details>}
    {action.pending && <p role="status" className="state-panel"><span className="spin" /> Waiting for the test network to confirm Revoked</p>}
    {action.error && <p role="alert" className="state-panel">{action.error}</p>}
    {action.result && <p role="status" className="state-panel">{action.result.explanation} {action.result.url && <a href={action.result.url} target="_blank" rel="noreferrer">View revoke transaction</a>}</p>}
    <div className="layout"><section aria-label="Keys" aria-busy={loading}>
      {loading && <div className="state-panel"><div className="spin" /><h3>Finding keys and reading permissions</h3><p>Checking indexed history and live chain permissions. RPC delays can make a lookup take longer.</p></div>}
      {error && <div className="state-panel" role="alert"><h3>Couldn’t load these keys</h3><p>{error}</p><button className="btn btn-line" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>}
      {data && <>
        {!data.complete && <div className="state-panel partial" role="alert"><h3>Partial result</h3><p>{!data.discoveryComplete ? 'Some history could not be scanned. More keys may exist in the missing ranges listed above.' : 'History was scanned, but some live permissions could not be read.'}</p><button className="btn btn-line" onClick={() => setAttempt(value => value + 1)}>Retry lookup</button></div>}
        {permissionSummaries(data.keys, data.permissionsAtTimestamp).map(summary => <p key={summary} className="fine">{summary}</p>)}
        {counts.all > 0 && <div ref={tabs} className="tabs" role="tablist" aria-label="Keys on this page"><span className="ind" aria-hidden="true" />{(['all','active','revoked','expired'] as const).map(value => <button key={value} role="tab" aria-selected={filter === value} aria-controls="key-cards" onClick={() => setFilter(value)}>{value === 'all' ? 'All' : value === 'active' ? 'Active' : value === 'revoked' ? 'Revoked' : 'Expired'}<b>{counts[value]}</b></button>)}</div>}
        {data.keys.length === 0 ? <div className="state-panel empty-result"><h3>{data.totalKeys ? 'No keys on this page' : data.discoveryComplete ? 'No access keys found' : 'No keys found in the covered history'}</h3><p>{data.totalKeys ? 'Choose a page within the available range.' : 'This account has no key events in the covered block ranges.'}</p><Link className="btn btn-cut" href="/#check">Check another address</Link></div> : <div className="cards" id="key-cards">{sortPageKeys(data.keys, data.permissionsAtTimestamp, child).filter(entry => filter === 'all' || entry.status === filter).map(entry => <KeyCard key={entry.key} entry={entry} nowSeconds={data.permissionsAtTimestamp} chain={chain} permanent={permanent} leftover={Boolean(child && entry.key.toLowerCase() === child.toLowerCase())}
          onRevoke={demo ? key => setPendingKey(key) : undefined} disabled={Boolean(demo?.busy || action.pending || (demo && entry.key.toLowerCase() === demo.child.toLowerCase() && !demo.childCanRevoke))}
          disabledReason={demo && entry.key.toLowerCase() === demo.child.toLowerCase() && !demo.childCanRevoke ? 'Complete the child’s payment step before cutting access.' : undefined} />)}{filter !== 'all' && !data.keys.some(key => key.status === filter) && <div className="state-panel">No {filter} keys on this page.</div>}</div>}
        {data.totalPages > 0 && <nav className="pagination" aria-label="Key pages"><div className="page-links">{page > 1 && <><Link href={href(1)}>First</Link><Link href={href(page - 1)}>Previous</Link></>}{page < data.totalPages && <><Link href={href(page + 1)}>Next</Link><Link href={href(data.totalPages)}>Last</Link></>}</div><form action={`/${chain}/${address}`}><label htmlFor={embedded ? 'embedded-page' : 'page'}>Page</label><input id={embedded ? 'embedded-page' : 'page'} name="page" type="number" min="1" max={data.totalPages} defaultValue={page} key={page} required /><span>of {data.totalPages.toLocaleString()}</span><button className="icon-btn">Go</button></form></nav>}
      </>}
    </section><aside className="rail"><div className="panel"><h3>Keys on this page</h3><div className="stack" aria-hidden="true"><i className="a" style={{flexGrow: counts.active}} /><i className="r" style={{flexGrow:counts.revoked}} /><i className="e" style={{flexGrow:counts.expired}} /></div><ul className="legend"><li style={{'--c':'var(--coral)'} as React.CSSProperties}>Can spend<b>{spenders}</b></li><li style={{'--c':'var(--teal)'} as React.CSSProperties}>Active<b>{counts.active}</b></li><li style={{'--c':'var(--mint)'} as React.CSSProperties}>Revoked<b>{counts.revoked}</b></li><li style={{'--c':'#4F7E77'} as React.CSSProperties}>Expired<b>{counts.expired}</b></li></ul><p>Cutting access needs the account owner. Looking doesn't.</p></div><div className="panel light"><h3>Why is a key still here?</h3><p>Revoking an admin key doesn't revoke the keys it created. <Link href="/learn#leftover">Read how the testnet case works</Link>.</p></div></aside></div>
    <dialog className="confirm" ref={dialog} aria-labelledby="cut-title" onCancel={() => setPendingKey(undefined)}><h3 id="cut-title">Cut this key's access?</h3><p>This revokes the key on Tempo. It can't be undone.</p><p className="mono">{pendingKey}</p><p>{selected?.raw ? keySummary(selected.raw, data?.permissionsAtTimestamp ?? Math.floor(Date.now()/1000)) : selected?.sentence}</p><div className="acts"><button className="btn btn-line" onClick={() => setPendingKey(undefined)}>Cancel</button><button className="btn btn-cut" onClick={() => pendingKey && revoke(pendingKey)}>Cut access</button></div></dialog>
  </Container>
}
