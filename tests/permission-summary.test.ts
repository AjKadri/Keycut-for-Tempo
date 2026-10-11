import test from 'node:test'
import assert from 'node:assert/strict'
import { permissionSummaries } from '../lib/permission-summary'
import { keyStatus, type KeyPermissions } from '../lib/permissions'
const raw: KeyPermissions = { signatureType: 0, keyId: '0x01', expiry: '0', enforceLimits: false,
  isRevoked: false, isAdmin: false, wasAdmin: false, isScoped: false, scopes: [], limits: [] }
test('identical broad permissions group independently of key identity', () => {
  assert.deepEqual(permissionSummaries([{raw}, {raw:{...raw,keyId:'0x02',signatureType:1}}], 2000),
    ['2 of 2 keys on this page have no cap, no restrictions and no expiry.'])
})
test('different expiry, admin privileges, scopes or allowances are not identical', () => {
  for(const other of [{...raw,expiry:'3000'}, {...raw,isAdmin:true}, {...raw,isScoped:true},
    {...raw,enforceLimits:true,limits:[{address:'0x01',symbol:'T',decimals:6,remaining:'1',periodEnd:'0'}]}]) {
    assert.deepEqual(permissionSummaries([{raw},{raw:other},{raw:null}],2000),[])
  }
})
test('expiry boundary and revocation decide whether limit reads apply', () => {
  assert.equal(keyStatus({...raw,expiry:'2000'},2000),'expired')
  assert.equal(keyStatus({...raw,expiry:'2001'},2000),'active')
  assert.equal(keyStatus({...raw,isRevoked:true},2000),'revoked')
})
