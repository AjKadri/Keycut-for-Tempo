'use client'

import { formatUnits } from 'viem'
import { riskLevel } from '../lib/key-presentation'
import { KeyScope } from './key-scope'
import { DateValue } from './date-value'
import { KeyAction } from './key-action'
import { keyStatus } from '../lib/permissions'
import type { KeyResult } from '../lib/keys-api'

export const shortAddress = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`
function Address({ value }: { value: string }) {
  return <details className="address"><summary>{shortAddress(value)}</summary><code>{value}</code></details>
}
export function KeyCard({ entry, nowSeconds, chain, permanent, onRevoke, disabled, disabledReason, leftover }: { entry: KeyResult; nowSeconds: number; chain: string; permanent?: boolean; onRevoke?: (key: string) => void; disabled?: boolean; disabledReason?: string; leftover?: boolean }) {
  const raw = entry.raw
  const never = raw && (BigInt(raw.expiry) === 0n || BigInt(raw.expiry) > 4_000_000_000n)
  const status = raw ? keyStatus(raw, nowSeconds) : 'unavailable'
  const risk = riskLevel(raw, nowSeconds)
  const leftoverNote = leftover && <div className="notice leftover-note"><strong>Left behind by a revoked admin key</strong><p className="subtext">This link is known from the demo’s setup, not read from the chain.</p></div>
  const rawDetails = <details className="raw"><summary>Raw chain values</summary><p className="subtext">First seen at block {entry.firstSeenBlock.toLocaleString()}. Event flags: {entry.eventFlags}.</p><pre>{JSON.stringify(raw, null, 2)}</pre></details>
  if (raw && (status === 'expired' || status === 'revoked')) return <details className="key-card compact-key" aria-label={`Key ${entry.key}`}><summary><span className="compact-address">{shortAddress(entry.key)}</span>{' '}<span>{status === 'expired' ? <>Expired <DateValue value={raw.expiry} showRelative={false} />. Can't spend or make calls.</> : <>Revoked. Can't spend or make calls.</>}</span>{leftover && <span className="leftover-label">Left behind by a revoked admin key</span>}</summary><div className="compact-body">{leftoverNote}<code>{entry.key}</code>{status === 'revoked' && raw.wasAdmin && <p className="subtext">Former admin key.</p>}{rawDetails}</div></details>
  const positiveLimits = raw?.limits.filter(token => BigInt(token.remaining) > 0n) ?? []
  return <article className="key-card" aria-label={`Key ${entry.key}`}>
    <div className="card-heading"><Address value={entry.key} /><div className="card-badges"><span className={`badge ${status}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>{risk && <span className={`badge risk-${risk}`}>{risk === 'high' ? 'High risk' : 'Review'}</span>}</div></div>
    {leftoverNote}<p className="sr-only">{entry.sentence}</p>
    {!raw ? <p role="alert">We couldn't read this key's permissions. Try the lookup again.</p> : <>
      {raw.isAdmin && <p className="notice">Admin key: can create and revoke other keys.</p>}
      <dl className="permission-grid">
        <div><dt>Spending cap</dt><dd>{!raw.enforceLimits ? 'No cap' : <>
          <span className="subtext">Remaining allowance · known stablecoins only</span>
          {positiveLimits.length === 0 && <p>No remaining allowance among known stablecoins</p>}
          {positiveLimits.map(token => <div className="token-line" key={token.address}><span>{formatUnits(BigInt(token.remaining), token.decimals)} {token.symbol}</span>{BigInt(token.periodEnd) > 0n && <span className="subtext">Period ends <DateValue value={token.periodEnd} /></span>}</div>)}

        </>}</dd></div>
        <div><dt>Who it can pay / call</dt><dd><KeyScope raw={raw} chain={chain} /></dd></div>
        <div><dt>Expiry</dt><dd>{never ? 'Never expires' : <DateValue value={raw.expiry} />}</dd></div>
      </dl>
    </>}
    {entry.riskFlags.length > 0 && <div className={`risks ${risk ? `risk-${risk}` : ''}`} aria-label="Risk flags">{entry.riskFlags.map(flag => <span key={flag}>{flag}</span>)}</div>}
    {raw && status === 'active' && <KeyAction keyId={entry.key} chain={chain} permanent={permanent} onRevoke={onRevoke} disabled={disabled} disabledReason={disabledReason} />}
    {rawDetails}
  </article>
}
