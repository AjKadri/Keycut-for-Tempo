import { keyStatus, type KeyPermissions } from './permissions'

export type RiskLevel = 'high' | 'review' | null
export function riskLevel(raw: KeyPermissions | null, nowSeconds: number): RiskLevel {
  if (!raw || keyStatus(raw, nowSeconds) !== 'active') return null
  if (!raw.enforceLimits || !raw.isScoped || raw.scopes.some(scope => scope.selectorRules.some(rule => rule.recipients.length === 0))) return 'high'
  return raw.isAdmin || BigInt(raw.expiry) === 0n || BigInt(raw.expiry) > 4_000_000_000n ? 'review' : null
}
export function sortPageKeys<T extends { raw: KeyPermissions | null }>(keys: readonly T[], nowSeconds: number): T[] {
  const rank = ({ raw }: T) => {
    if (!raw) return 5
    const status = keyStatus(raw, nowSeconds)
    if (status === 'active') return riskLevel(raw, nowSeconds) === 'high' ? 0 : riskLevel(raw, nowSeconds) === 'review' ? 1 : 2
    return status === 'expired' ? 3 : 4
  }
  return [...keys].sort((a, b) => rank(a) - rank(b))
}
export function pageVerdict(keys: readonly { raw: KeyPermissions | null }[], nowSeconds: number) {
  const uncapped = keys.filter(({ raw }) => raw && keyStatus(raw, nowSeconds) === 'active' && !raw.enforceLimits).length
  const high = keys.filter(({ raw }) => riskLevel(raw, nowSeconds) === 'high').length
  const review = keys.filter(({ raw }) => riskLevel(raw, nowSeconds) === 'review').length
  const unavailable = keys.some(({ raw }) => !raw)
  const verdict = uncapped ? `${uncapped} ${uncapped === 1 ? 'key has' : 'keys have'} no spending cap`
    : high ? `${high} ${high === 1 ? 'key has' : 'keys have'} unrestricted calls or recipients`
    : review ? `${review} ${review === 1 ? 'key needs' : 'keys need'} review`
    : unavailable ? 'Some key permissions are unavailable' : 'No risky keys on this page'
  return unavailable && (uncapped || high || review) ? `${verdict}. Some permissions are unavailable.` : verdict
}
