'use client'

import { formatUnits, toFunctionSelector } from 'viem'
import { keyStatus } from '../lib/permissions'
import type { KeyResult } from '../lib/keys-api'

export const shortAddress = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`
function Address({ value }: { value: string }) {
  return <details className="address"><summary>{shortAddress(value)}</summary><code>{value}</code></details>
}
function relativeDate(value: string) {
  const days = Math.round((Number(value) * 1000 - Date.now()) / 86_400_000)
  return Math.abs(days) < 1 ? 'today' : new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }).format(days, 'day')
}
function DateValue({ value, showRelative = true }: { value: string; showRelative?: boolean }) {
  const date = new Date(Number(value) * 1000)
  return <><time dateTime={date.toISOString()}>{date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time>{showRelative && <span className="subtext">{relativeDate(value)}</span>}</>
}
const functions: Record<string, string> = { '0xa9059cbb': 'Transfer', '0x095ea7b3': 'Approve', '0x23b872dd': 'Transfer from',
  [toFunctionSelector('transferWithMemo(address,uint256,bytes32)')]: 'Transfer with memo' }

export function KeyCard({ entry, nowSeconds }: { entry: KeyResult; nowSeconds: number }) {
  const raw = entry.raw
  const never = raw && (BigInt(raw.expiry) === 0n || BigInt(raw.expiry) > 4_000_000_000n)
  const status = raw ? keyStatus(raw, nowSeconds) : 'unavailable'
  const positiveLimits = raw?.limits.filter(token => BigInt(token.remaining) > 0n) ?? []
  const zeroLimits = raw?.limits.filter(token => BigInt(token.remaining) === 0n) ?? []
  return <article className="key-card" aria-label={`Key ${entry.key}`}>
    <div className="card-heading"><Address value={entry.key} /><span className={`badge ${status}`}>{status}</span></div>
    <p className="sr-only">{entry.sentence}</p>
    {!raw ? <p role="alert">We couldn't read this key's permissions. Try the lookup again.</p> : raw.isRevoked ? <>
      <p className="mt-5 font-medium">Can’t spend or make calls.</p>
      <p className="subtext">{raw.wasAdmin ? 'Former admin key. ' : ''}The chain has cleared its permissions. Former caps, payees and expiry are unavailable.</p>
    </> : status === 'expired' ? <div className="notice"><p>Expired on <DateValue value={raw.expiry} showRelative={false} />. It can no longer spend or make calls.</p><span className="subtext">{relativeDate(raw.expiry)}</span></div> : <>
      {raw.isAdmin && <p className="notice">Admin key: can create and revoke other keys.</p>}
      <dl className="permission-grid">
        <div><dt>Spending cap</dt><dd>{!raw.enforceLimits ? 'No cap' : <>
          <span className="subtext">Remaining allowance · known stablecoins only</span>
          {positiveLimits.length === 0 && <p>No remaining allowance among known stablecoins</p>}
          {positiveLimits.map(token => <div className="token-line" key={token.address}><span>{formatUnits(BigInt(token.remaining), token.decimals)} {token.symbol}</span>{BigInt(token.periodEnd) > 0n && <span className="subtext">Period ends <DateValue value={token.periodEnd} /></span>}</div>)}
          {zeroLimits.length > 0 && <details className="mt-2"><summary className="cursor-pointer">{zeroLimits.length} zero allowances</summary>{zeroLimits.map(token => <div className="token-line" key={token.address}>0 {token.symbol}{BigInt(token.periodEnd) > 0n && <span className="subtext">Period ends <DateValue value={token.periodEnd} /></span>}</div>)}</details>}
        </>}</dd></div>
        <div><dt>Who it can pay / call</dt><dd>{!raw.isScoped ? 'Any recipient · any function' : raw.scopes.length === 0 ? 'No calls allowed' : raw.scopes.map((scope, i) => <div className="scope" key={i}>
          <span className="subtext">On target</span><Address value={scope.target} />
          {scope.selectorRules.length === 0 ? <p>Any function · any recipient</p> : scope.selectorRules.map((rule, j) => <div key={j} className="mt-2"><span>{functions[rule.selector.toLowerCase()] || `Function ${rule.selector}`}</span>
            {rule.recipients.length === 0 ? <p>Any recipient</p> : <div className="payees">{rule.recipients.map(value => <Address key={value} value={value} />)}</div>}
          </div>)}
        </div>)}</dd></div>
        <div><dt>Expiry</dt><dd>{never ? 'Never expires' : <DateValue value={raw.expiry} />}</dd></div>
      </dl>
    </>}
    {entry.riskFlags.length > 0 && <div className="risks" aria-label="Risk flags">{entry.riskFlags.map(flag => <span key={flag}>{flag}</span>)}</div>}
    <details className="raw"><summary>Raw chain values</summary><p className="subtext">First seen at block {entry.firstSeenBlock.toLocaleString()}. Event flags: {entry.eventFlags}.</p><pre>{JSON.stringify(raw, null, 2)}</pre></details>
  </article>
}
