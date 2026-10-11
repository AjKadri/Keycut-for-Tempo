import { formatUnits, toFunctionSelector } from 'viem'

const functionNames: Record<string, string> = {
  '0xa9059cbb': 'transfer', '0x095ea7b3': 'approve', '0x23b872dd': 'transferFrom',
  [toFunctionSelector('transferWithMemo(address,uint256,bytes32)')]: 'transfer with memo',
}

export type KnownToken = { address: string; symbol: string; decimals: number }
export type PermissionScope = { target: string; selectorRules: readonly { selector: string; recipients: readonly string[] }[] }
export type KeyPermissions = {
  signatureType: number; keyId: string; expiry: string; enforceLimits: boolean; isRevoked: boolean
  isAdmin: boolean; wasAdmin: boolean; isScoped: boolean; scopes: readonly PermissionScope[]
  limits: (KnownToken & { remaining: string; periodEnd: string })[]
}

export function keyStatus(raw: Pick<KeyPermissions, 'expiry' | 'isRevoked'>, nowSeconds: number) {
  const expiry = BigInt(raw.expiry)
  return raw.isRevoked ? 'revoked' : expiry !== 0n && expiry <= 4_000_000_000n && expiry <= BigInt(nowSeconds) ? 'expired' : 'active'
}

export function describePermissions(raw: KeyPermissions, nowSeconds: number) {
  const expiry = BigInt(raw.expiry)
  const neverExpires = expiry === 0n || expiry > 4_000_000_000n
  const status = keyStatus(raw, nowSeconds)
  if (status === 'revoked') return { status, sentence: "Revoked. It can't spend or make calls." +
    (raw.wasAdmin ? ' Was an admin key.' : '') + ' Former permissions are no longer available from the chain.', riskFlags: [] }
  if (status === 'expired') return { status,
    sentence: `Expired on ${new Date(Number(expiry) * 1000).toISOString()}. It can no longer spend or make calls.`, riskFlags: [] }
  const words: string[] = [], risks: string[] = []
  words.push('Active.')
  if (raw.isAdmin) { words.push('Can create and revoke other keys.'); risks.push('admin key') }
  if (!raw.enforceLimits) { words.push(`no spending cap.`); risks.push('no spending cap') }
  else {
    const positive = raw.limits.filter((limit) => BigInt(limit.remaining) > 0n)
    words.push(positive.length ? `spending allowance remaining: ${positive.map((limit) =>
      `${formatUnits(BigInt(limit.remaining), limit.decimals)} ${limit.symbol}${BigInt(limit.periodEnd) > 0n ? ` until ${new Date(Number(limit.periodEnd) * 1000).toISOString()}` : ''}`).join(', ')} (known stablecoins only).`
      : `no spending allowance remaining among known stablecoins.`)
  }
  if (!raw.isScoped) { words.push(`can call any function and pay any recipient.`); risks.push('no call restrictions') }
  else if (raw.scopes.length === 0) words.push(`no calls allowed.`)
  else for (const scope of raw.scopes) {
    const target = raw.limits.find((token) => token.address.toLowerCase() === scope.target.toLowerCase())?.symbol ?? scope.target
    if (scope.selectorRules.length === 0) { words.push(`any function on ${target}.`); risks.push('any function on a target') }
    for (const rule of scope.selectorRules) {
      const functionName = functionNames[rule.selector.toLowerCase()] ?? `function ${rule.selector}`
      words.push(`${functionName} on ${target} ${rule.recipients.length ? `only to ${rule.recipients.join(', ')}` : 'to any recipient'}.`)
      if (!rule.recipients.length) risks.push('any recipient')
      if (rule.selector.toLowerCase() === '0x23b872dd') risks.push('transferFrom is not covered by spending limits')
    }
  }
  words.push(neverExpires ? 'Never expires.' : `Expires ${new Date(Number(expiry) * 1000).toISOString()}.`)
  if (neverExpires) risks.push('never expires')
  else if (expiry > BigInt(nowSeconds + 30 * 86400)) risks.push('expires in more than 30 days')
  return { status, sentence: words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' '), riskFlags: [...new Set(risks)] }
}
