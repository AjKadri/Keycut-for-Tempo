import { toFunctionSelector } from 'viem'
import tokens from '../lib/known-tokens.json'
import type { KeyPermissions } from '../lib/permissions'
const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`
const verbs: Record<string, string> = { '0xa9059cbb': 'Can send', '0x095ea7b3': 'Can approve',
  '0x23b872dd': 'Can use transferFrom on', [toFunctionSelector('transferWithMemo(address,uint256,bytes32)')]: 'Can send with a memo' }
export function KeyScope({ raw, chain }: { raw: KeyPermissions; chain: string }) {
  if (!raw.isScoped) return <>Any recipient · any function</>
  if (!raw.scopes.length) return <>No calls allowed</>
  return <>{raw.scopes.map((scope, i) => {
    const token = raw.limits.find(token => token.address.toLowerCase() === scope.target.toLowerCase()) ??
      tokens.tokens.find(token => token.chainId === (chain === 'mainnet' ? 4217 : 42431) && token.address.toLowerCase() === scope.target.toLowerCase())
    const target = token?.symbol ?? short(scope.target)
    const rules = scope.selectorRules.length ? scope.selectorRules : [null]
    return <div className="scope" key={i}>{rules.map((rule, j) => <details className="scope-detail" key={j}>
      <summary>{rule ? <>{verbs[rule.selector.toLowerCase()] ?? `Can call function ${rule.selector} on`} {target} {rule.selector.toLowerCase() === '0x095ea7b3' ? 'for' : 'to'} {rule.recipients.length ? <>{rule.recipients.length} {rule.recipients.length === 1 ? 'address' : 'addresses'}: {rule.recipients.map(short).join(', ')}</> : 'any address'}</> : <>Can call any function on {target} for any recipient</>}</summary>
      <div className="scope-values"><p>{token ? `Token: ${token.symbol}` : 'Target'}<br /><code>{scope.target}</code></p>{rule && <><p>Function selector: <code>{rule.selector}</code></p><p>{rule.recipients.length ? 'Allowed addresses' : 'Any address allowed'}</p>{rule.recipients.map(value => <code key={value}>{value}</code>)}</>}</div>
    </details>)}</div>
  })}</>
}
