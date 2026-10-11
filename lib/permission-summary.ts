import { keyStatus, type KeyPermissions } from './permissions'

// Key IDs and signature types identify the signer, not its permissions.
function permissionIdentity(raw: KeyPermissions, nowSeconds: number) {
  return JSON.stringify({ status: keyStatus(raw, nowSeconds), admin: raw.isAdmin, expiry: raw.expiry,
    enforceLimits: raw.enforceLimits, isScoped: raw.isScoped,
    scopes: raw.scopes.map(scope => ({ target: scope.target.toLowerCase(), rules: scope.selectorRules.map(rule => ({
      selector: rule.selector.toLowerCase(), recipients: rule.recipients.map(value => value.toLowerCase()).sort(),
    })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) })).sort((a, b) => a.target.localeCompare(b.target)),
    limits: raw.limits.map(limit => ({ token: limit.address.toLowerCase(), remaining: limit.remaining, periodEnd: limit.periodEnd }))
      .sort((a, b) => a.token.localeCompare(b.token)),
  })
}
export function permissionSummaries(keys: readonly { raw: KeyPermissions | null }[], nowSeconds: number) {
  const groups = new Map<string, { count: number; raw: KeyPermissions }>()
  for (const { raw } of keys) {
    if (!raw) continue
    const identity = permissionIdentity(raw, nowSeconds), prior = groups.get(identity)
    groups.set(identity, { count: (prior?.count ?? 0) + 1, raw })
  }
  return [...groups.values()].filter(group => group.count > 1).sort((a, b) => b.count - a.count).map(({ count, raw }) => {
    const prefix = `${count} of ${keys.length} keys on this page`
    if (keyStatus(raw, nowSeconds) === 'active' && !raw.enforceLimits && !raw.isScoped &&
      (BigInt(raw.expiry) === 0n || BigInt(raw.expiry) > 4_000_000_000n)) {
      return `${prefix} have no cap, no restrictions and no expiry.${raw.isAdmin ? ' These are admin keys.' : ''}`
    }
    return `${prefix} share identical permissions and expiry.${keyStatus(raw, nowSeconds) !== 'active' ? ' They can no longer spend or make calls.' : ''}`
  })
}
