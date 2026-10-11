'use client'

import { formatUnits, toFunctionSelector } from 'viem'
import { riskLevel } from '../lib/key-presentation'
import { DateValue } from './date-value'
import { KeyAction } from './key-action'
import { keyStatus } from '../lib/permissions'
import type { KeyResult } from '../lib/keys-api'

export const shortAddress = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`
function Address({ value }: { value: string }) {
  return <details className="address"><summary>{shortAddress(value)}</summary><code>{value}</code></details>
}
const functions: Record<string, string> = { '0xa9059cbb': 'Transfer', '0x095ea7b3': 'Approve', '0x23b872dd': 'Transfer from',
  [toFunctionSelector('transferWithMemo(address,uint256,bytes32)')]: 'Transfer with memo' }

export function KeyCard({ entry, nowSeconds, chain, permanent, onRevoke, disabled, disabledReason }: { entry: KeyResult; nowSeconds: number; chain: string; permanent?: boolean; onRevoke?: (key: string) => void; disabled?: boolean; disabledReason?: string }) {
  const raw = entry.raw
  const never = raw && (BigInt(raw.expiry) === 0n || BigInt(raw.expiry) > 4_000_000_000n)
  const status = raw ? keyStatus(raw, nowSeconds) : 'unavailable'
  const risk = riskLevel(raw, nowSeconds)
  const rawDetails = <details className="raw"><summary>Raw chain values</summary><p className="subtext">First seen at block {entry.firstSeenBlock.toLocaleString()}. Event flags: {entry.eventFlags}.</p><pre>{JSON.stringify(raw, null, 2)}</pre></details>
  if (raw && (status === 'expired' || status === 'revoked')) return <details className="key-card compact-key" aria-label={`Key ${entry.key}`}><summary><span className="compact-address">{shortAddress(entry.key)}</span>{' '}<span>{status === 'expired' ? <>Expired <DateValue value={raw.expiry} showRelative={false} />. Can't spend or make calls.</> : <>Revoked. Can't spend or make calls.</>}</span></summary><div className="compact-body"><code>{entry.key}</code>{status === 'revoked' && raw.wasAdmin && <p className="subtext">Former admin key.</p>}{rawDetails}</div></details>
  const positiveLimits = raw?.limits.filter(token => BigInt(token.remaining) > 0n) ?? []
  const zeroLimits = raw?.limits.filter(token => BigInt(token.remaining) === 0n) ?? []
  return <article className="key-card" aria-label={`Key ${entry.key}`}>
    <div className="card-heading"><Address value={entry.key} /><div className="card-badges"><span className={`badge ${status}`}>{status.charAt(0).toUpperCase() + status.slice(1)}</span>{risk && <span className={`badge risk-${risk}`}>{risk === 'high' ? 'High risk' : 'Review'}</span>}</div></div>
    <p className="sr-only">{entry.sentence}</p>
    {!raw ? <p role="alert">We couldn't read this key's permissions. Try the lookup again.</p> : <>
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
    {entry.riskFlags.length > 0 && <div className={`risks ${risk ? `risk-${risk}` : ''}`} aria-label="Risk flags">{entry.riskFlags.map(flag => <span key={flag}>{flag}</span>)}</div>}
    {raw && status === 'active' && <KeyAction keyId={entry.key} chain={chain} permanent={permanent} onRevoke={onRevoke} disabled={disabled} disabledReason={disabledReason} />}
    {rawDetails}
  </article>
}
