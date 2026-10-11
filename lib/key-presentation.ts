import { toFunctionSelector } from 'viem'
import { keyStatus, type KeyPermissions } from './permissions'

export type RiskLevel = 'high' | 'review' | null
export function riskLevel(raw: KeyPermissions | null, nowSeconds: number): RiskLevel {
  if (!raw || keyStatus(raw, nowSeconds) !== 'active') return null
  if (!raw.enforceLimits || !raw.isScoped || raw.scopes.some(scope => scope.selectorRules.some(rule => rule.recipients.length === 0))) return 'high'
  return raw.isAdmin || BigInt(raw.expiry) === 0n || BigInt(raw.expiry) > BigInt(nowSeconds + 30 * 86400) ? 'review' : null
}
export function sortPageKeys<T extends { raw: KeyPermissions | null; key?: string }>(keys: readonly T[], nowSeconds: number, firstKey?: string): T[] {
  const rank = ({ raw }: T) => {
    if (!raw) return 5
    const status = keyStatus(raw, nowSeconds)
    if (status === 'active') return riskLevel(raw, nowSeconds) === 'high' ? 0 : riskLevel(raw, nowSeconds) === 'review' ? 1 : 2
    return status === 'expired' ? 3 : 4
  }
  return [...keys].sort((a, b) => Number(Boolean(firstKey && (b.key ?? b.raw?.keyId)?.toLowerCase() === firstKey.toLowerCase())) - Number(Boolean(firstKey && (a.key ?? a.raw?.keyId)?.toLowerCase() === firstKey.toLowerCase())) || rank(a) - rank(b))
}
// This describes permission to spend, not the account's available balance.
export function spendingAccess(raw: KeyPermissions): 'allowed' | 'none' | 'unknown' {
  const allowance = (target: string) => raw.limits.find(limit => limit.address.toLowerCase() === target.toLowerCase())
  if (!raw.isScoped) return !raw.enforceLimits || raw.limits.some(limit => BigInt(limit.remaining) > 0n) ? 'allowed' : 'unknown'
  let unknown = false
  for (const scope of raw.scopes) {
    if (!scope.selectorRules.length) { unknown = true; continue }
    for (const rule of scope.selectorRules) {
      const selector = rule.selector.toLowerCase()
      if (selector === '0x23b872dd') return 'allowed' // transferFrom bypasses spending limits.
      if (['0xa9059cbb', '0x095ea7b3', toFunctionSelector('transferWithMemo(address,uint256,bytes32)')].includes(selector)) {
        if (!raw.enforceLimits) return 'allowed'
        const limit = allowance(scope.target)
        if (limit && BigInt(limit.remaining) > 0n) return 'allowed'
        if (!limit) unknown = true
      } else unknown = true
    }
  }
  return unknown ? 'unknown' : 'none'
}
export function pageVerdict(keys: readonly { raw: KeyPermissions | null }[], nowSeconds: number, paginated = false) {
  const active = keys.filter(({ raw }) => raw && keyStatus(raw, nowSeconds) === 'active')
  const spenders = active.filter(({ raw }) => spendingAccess(raw!) === 'allowed')
  const spending = spenders.length
  const unknown = active.filter(({ raw }) => spendingAccess(raw!) === 'unknown').length
  const uncapped = spenders.filter(({ raw }) => !raw!.enforceLimits).length
  const unavailable = keys.some(({ raw }) => !raw)
  const where = paginated ? ' on this page' : ' from this account'
  let verdict = spending ? `${spending} ${spending === 1 ? 'key can' : 'keys can'} still spend${where}`
    : active.length ? `${active.length} active ${active.length === 1 ? 'key remains' : 'keys remain'}${paginated ? ' on this page' : ''}. ${unknown ? 'Spending access needs review' : 'No spending allowed by the checked permissions'}`
    : unavailable ? 'Some key permissions are unavailable' : `No key can spend${where}`
  if (spending && uncapped) verdict += `. ${uncapped} ${uncapped === 1 ? 'has' : 'have'} no spending cap.`
  else if (spending && spenders.some(({ raw }) => riskLevel(raw, nowSeconds) === 'high')) verdict += '. Some calls or recipients are unrestricted.'
  if (spending && unknown) verdict += ` ${unknown} other active ${unknown === 1 ? 'key needs' : 'keys need'} a spending review.`
  if (unavailable && active.length) verdict += ' Some permissions are unavailable.'
  return verdict
}
