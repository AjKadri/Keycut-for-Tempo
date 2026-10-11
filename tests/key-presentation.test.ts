import test from 'node:test'
import assert from 'node:assert/strict'
import { riskLevel, sortPageKeys, pageVerdict, spendingAccess } from '../lib/key-presentation'
import type { KeyPermissions } from '../lib/permissions'
const base: KeyPermissions = { signatureType: 0, keyId: 'key', expiry: '2000', enforceLimits: true, isRevoked: false,
  isAdmin: false, wasAdmin: false, isScoped: true, scopes: [{ target: 'token', selectorRules: [{ selector: '0xa9059cbb', recipients: ['vendor'] }] }], limits: [{address:"token",symbol:"AlphaUSD",decimals:6,remaining:"3",periodEnd:"0"}] }
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
test('page verdict reports access before risk, scopes unknown results to the page', () => {
  assert.equal(pageVerdict([{raw:{...base,enforceLimits:false}},{raw:{...base,isRevoked:true}}],1000),'1 key can still spend from this account. 1 has no spending cap.')
  assert.equal(pageVerdict([{raw:base}],1000),'1 key can still spend from this account')
  assert.equal(pageVerdict([{raw:{...base,expiry:'0'}}],1000),'1 key can still spend from this account')
  assert.equal(pageVerdict([{raw:{...base,isRevoked:true}}],1000,true),'No key can spend on this page')
  assert.equal(pageVerdict([{raw:null}],1000),'Some key permissions are unavailable')
  assert.match(pageVerdict([{raw:base},{raw:null}],1000),/still spend.*Some permissions are unavailable/)
  assert.match(pageVerdict([{raw:{...base,scopes:[]}}],1000),/1 active key remains.*No spending allowed/)
})
test('long finite expiry is Review after exactly thirty days, and demo child stays first even after revoke', () => {
  assert.equal(riskLevel({...base,expiry:String(1000 + 30 * 86400)},1000),null)
  assert.equal(riskLevel({...base,expiry:String(1001 + 30 * 86400)},1000),'review')
  const keys=[{key:'risky',raw:{...base,enforceLimits:false}},{key:'child',raw:{...base,isRevoked:true}},{key:'unknown',raw:null}]
  assert.equal(sortPageKeys(keys,1000,'child')[0]!.key,'child')
  assert.equal(sortPageKeys(keys,1000,'unknown')[0]!.key,'unknown')
})
test('spending verdict distinguishes exhausted or unknown scopes and never attaches an unused uncapped key to spenders', () => {
  const zero = {...base, limits:[{...base.limits[0]!,remaining:'0'}]}
  assert.equal(spendingAccess(zero),'none')
  assert.match(pageVerdict([{raw:zero}],1000),/active key remains.*No spending allowed/)
  assert.equal(spendingAccess({...base,scopes:[{target:'token',selectorRules:[{selector:'0x12345678',recipients:[]}]}]}),'unknown')
  assert.equal(spendingAccess({...zero,isScoped:false}),'unknown')
  assert.equal(spendingAccess({...zero,scopes:[{target:'token',selectorRules:[{selector:'0x23b872dd',recipients:['vendor']}]}]}),'allowed')
  assert.equal(pageVerdict([{raw:base},{raw:{...base,enforceLimits:false,scopes:[]}}],1000),'1 key can still spend from this account')
})
