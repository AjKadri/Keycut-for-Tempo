import test from 'node:test'
import assert from 'node:assert/strict'
import { describePermissions, type KeyPermissions } from '../lib/permissions'

const token = { address: '0x20c0000000000000000000000000000000000001', symbol: 'AlphaUSD', decimals: 6 }
const base: KeyPermissions = { signatureType: 0, keyId: '0x1111111111111111111111111111111111111111',
  expiry: '2000', enforceLimits: true, isRevoked: false, isAdmin: false, wasAdmin: false,
  isScoped: true, scopes: [{ target: token.address, selectorRules: [{ selector: '0xa9059cbb', recipients: ['0x2222222222222222222222222222222222222222'] }] }],
  limits: [{ ...token, remaining: '12500000', periodEnd: '0' }] }

test('restricted transfer states remaining amount, recipient and expiry', () => {
  const result = describePermissions(base, 1000)
  assert.equal(result.status, 'active')
  assert.match(result.sentence, /12.5 AlphaUSD/)
  assert.match(result.sentence, /transfer on AlphaUSD only to 0x222/)
  assert.match(result.sentence, /Expires 1970-01-01T00:33:20.000Z/)
  assert.deepEqual(result.riskFlags, [])
})

test('empty recipient list is unrestricted, rather than denied', () => {
  const result = describePermissions({ ...base, scopes: [{ target: token.address,
    selectorRules: [{ selector: '0xa9059cbb', recipients: [] }] }] }, 1000)
  assert.match(result.sentence, /to any recipient/)
  assert.ok(result.riskFlags.includes('any recipient'))
})

test('scoped with no scopes permits no calls, empty rules permit any function', () => {
  assert.match(describePermissions({ ...base, scopes: [] }, 1000).sentence, /no calls allowed/)
  const anyFunction = describePermissions({ ...base, scopes: [{ target: token.address, selectorRules: [] }] }, 1000)
  assert.match(anyFunction.sentence, /any function on AlphaUSD/)
  assert.ok(anyFunction.riskFlags.includes('any function on a target'))
})

test('uncapped unrestricted key carries the three broad-access flags', () => {
  const result = describePermissions({ ...base, expiry: '0', enforceLimits: false, isScoped: false }, 1000)
  assert.match(result.sentence, /no spending cap/)
  assert.match(result.sentence, /can call any function and pay any recipient/)
  assert.deepEqual(result.riskFlags, ['no spending cap', 'no call restrictions', 'never expires'])
})

test('revoked takes precedence over expiry without describing cleared fields as former permissions', () => {
  const result = describePermissions({ ...base, isRevoked: true, expiry: '999', wasAdmin: true }, 1000)
  assert.equal(result.status, 'revoked')
  assert.match(result.sentence, /^Revoked\. It can't spend or make calls\./)
  assert.match(result.sentence, /Was an admin key/)
  assert.match(result.sentence, /Former permissions are no longer available/)
  assert.doesNotMatch(result.sentence, /spending allowance|no spending cap|Never expires/)
  assert.deepEqual(result.riskFlags, [])
})

test('expiry boundary is expired; very large expiry never expires', () => {
  assert.equal(describePermissions(base, 2000).status, 'expired')
  const result = describePermissions({ ...base, expiry: '18446744073709551615' }, 2000)
  assert.equal(result.status, 'active')
  assert.match(result.sentence, /Never expires/)
})

test('admin and transferFrom risks are stated without inventing lineage', () => {
  const result = describePermissions({ ...base, isAdmin: true, scopes: [{ target: token.address,
    selectorRules: [{ selector: '0x23b872dd', recipients: [] }] }] }, 1000)
  assert.match(result.sentence, /Can create and revoke other keys/)
  assert.ok(result.riskFlags.includes('admin key'))
  assert.ok(result.riskFlags.includes('transferFrom is not covered by spending limits'))
})

test('zero allowances and finite periods are explicit', () => {
  assert.match(describePermissions({ ...base, limits: [{ ...token, remaining: '0', periodEnd: '0' }] }, 1000).sentence, /no spending allowance remaining among known stablecoins/)
  assert.match(describePermissions({ ...base, limits: [{ ...token, remaining: '1000000', periodEnd: '1500' }] }, 1000).sentence, /1 AlphaUSD until 1970-01-01T00:25:00.000Z/)
})
