import { formatUnits, toFunctionSelector } from 'viem'
import { keyStatus, type KeyPermissions } from './permissions'

export function keySummary(raw: KeyPermissions, nowSeconds: number) {
  const status = keyStatus(raw, nowSeconds)
  const date = new Date(Number(raw.expiry) * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  if (status === 'revoked') return "Revoked. Can't spend or make calls."
  if (status === 'expired') return `Expired ${date}. Can't spend or make calls.`
  const end = BigInt(raw.expiry) === 0n || BigInt(raw.expiry) > 4_000_000_000n ? 'Never expires.' : `Ends ${date}.`
  if (raw.isScoped && raw.scopes.length === 0) return `Can't spend or make calls. ${end}`
  const positive = raw.limits.filter(token => BigInt(token.remaining) > 0n)
  const sends = positive.flatMap(token => {
    const scopes = raw.scopes.filter(scope => scope.target.toLowerCase() === token.address.toLowerCase())
    const rules = scopes.flatMap(scope => scope.selectorRules.filter(rule => ['0xa9059cbb', toFunctionSelector('transferWithMemo(address,uint256,bytes32)')].includes(rule.selector.toLowerCase())))
    const any = !raw.isScoped || scopes.some(scope => scope.selectorRules.length === 0) || rules.some(rule => rule.recipients.length === 0)
    const recipients = new Set(rules.flatMap(rule => rule.recipients.map(value => value.toLowerCase())))
    if (!any && !recipients.size) return []
    const who = any ? 'any address' : `${recipients.size} ${recipients.size === 1 ? 'address' : 'addresses'}`
    return [`Can send ${formatUnits(BigInt(token.remaining), token.decimals)} ${token.symbol} to ${who}.`]
  })
  let access: string
  if (!raw.enforceLimits) access = !raw.isScoped ? 'Can spend without a cap and call anything.' : 'Can call allowed contracts without a spending cap.'
  else if (sends.length) access = sends.join(' ')
  else access = positive.length ? 'Can use its allowance for permitted calls.' : 'No remaining allowance among known stablecoins.'
  if (raw.isAdmin) access += ' Can create and revoke other keys.'
  return `${access} ${end}`
}
