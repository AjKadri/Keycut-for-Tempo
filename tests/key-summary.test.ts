import test from 'node:test'
import assert from 'node:assert/strict'
import { keySummary } from '../lib/key-summary'
import type { KeyPermissions } from '../lib/permissions'
const raw: KeyPermissions = {signatureType:0,keyId:'key',expiry:'1823282528',enforceLimits:true,isRevoked:false,isAdmin:false,wasAdmin:false,isScoped:true,scopes:[{target:'token',selectorRules:[{selector:'0xa9059cbb',recipients:['vendor']}]}],limits:[{address:'token',symbol:'AlphaUSD',decimals:6,remaining:'3000000',periodEnd:'0'}]}
test('summary uses token units, deduplicated recipients and readable expiry',()=>{
  assert.equal(keySummary(raw,1700000000),'Can send 3 AlphaUSD to 1 address. Ends 11 Oct 2027.')
  assert.match(keySummary({...raw,scopes:[{target:'token',selectorRules:[{selector:'0xa9059cbb',recipients:[]}]}]},1700000000),/to any address/)
})
test('summary cannot give spending power to inactive, deny-all or exhausted keys',()=>{
  assert.equal(keySummary({...raw,isRevoked:true},1700000000),"Revoked. Can't spend or make calls.")
  assert.match(keySummary(raw,1900000000),/^Expired 11 Oct 2027/)
  assert.match(keySummary({...raw,scopes:[]},1700000000),/^Can't spend or make calls/)
  assert.match(keySummary({...raw,limits:[]},1700000000),/^No remaining allowance among known stablecoins/)
})

test('recipients stay tied to their token and empty selector rules mean any function',()=>{
  const other = {target:'other',selectorRules:[{selector:'0xa9059cbb',recipients:[]}]}
  assert.equal(keySummary({...raw,scopes:[...raw.scopes,other]},1700000000),'Can send 3 AlphaUSD to 1 address. Ends 11 Oct 2027.')
  assert.equal(keySummary({...raw,scopes:[{target:'token',selectorRules:[]}]},1700000000),'Can send 3 AlphaUSD to any address. Ends 11 Oct 2027.')
})
