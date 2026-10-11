import test from 'node:test'
import assert from 'node:assert/strict'
import { riskLevel, sortPageKeys, pageVerdict } from '../lib/key-presentation'
import type { KeyPermissions } from '../lib/permissions'
const base: KeyPermissions = { signatureType: 0, keyId: 'key', expiry: '2000', enforceLimits: true, isRevoked: false,
  isAdmin: false, wasAdmin: false, isScoped: true, scopes: [{ target: 'token', selectorRules: [{ selector: 'transfer', recipients: ['vendor'] }] }], limits: [] }
test('active risk precedence uses permissions, including empty recipients', () => {
  assert.equal(riskLevel(base,1000),null)
  for (const raw of [{...base,enforceLimits:false},{...base,isScoped:false},{...base,scopes:[{target:'token',selectorRules:[{selector:'transfer',recipients:[]}]}]}]) assert.equal(riskLevel(raw,1000),'high')
  assert.equal(riskLevel({...base,expiry:'0'},1000),'review')
  assert.equal(riskLevel({...base,isAdmin:true},1000),'review')
  assert.equal(riskLevel({...base,expiry:'18446744073709551615'},1000),'review')
  assert.equal(riskLevel({...base,isAdmin:true,enforceLimits:false},1000),'high')
  assert.equal(riskLevel({...base,isRevoked:true,enforceLimits:false},1000),null)
  assert.equal(riskLevel({...base,expiry:'1000',enforceLimits:false},1000),null)
})
test('page sort is stable, preserves membership and keeps inactive keys compactly ordered', () => {
  const keys=[{id:'revoked',raw:{...base,isRevoked:true}},{id:'safe',raw:base},{id:'expired',raw:{...base,expiry:'1000'}},{id:'high1',raw:{...base,enforceLimits:false}},{id:'review',raw:{...base,expiry:'0'}},{id:'high2',raw:{...base,isScoped:false}},{id:'unknown',raw:null}]
  assert.deepEqual(sortPageKeys(keys,1000).map(key=>key.id),['high1','high2','review','safe','expired','revoked','unknown'])
  assert.equal(keys[0]!.id,'revoked')
})
test('page verdict counts active keys only and never clears unknown permissions', () => {
  assert.equal(pageVerdict([{raw:{...base,enforceLimits:false}},{raw:{...base,enforceLimits:false,isRevoked:true}}],1000),'1 key has no spending cap')
  assert.equal(pageVerdict([{raw:base}],1000),'No risky keys on this page')
  assert.equal(pageVerdict([{raw:{...base,expiry:'0'}}],1000),'1 key needs review')
  assert.equal(pageVerdict([{raw:null}],1000),'Some key permissions are unavailable')
  assert.match(pageVerdict([{raw:{...base,isScoped:false}},{raw:null}],1000),/unrestricted calls or recipients\. Some permissions are unavailable/)
})
