import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeFunctionData } from 'viem'
import { Abis, Addresses } from 'viem/tempo'
import { accountWalletEnabled, accountWalletMode, accountWalletRevokeCall, assertWalletChain } from '../lib/account-wallet'
import { demoChainAllowed } from '../lib/demo-network'

const account = '0x1713DB06803C57c4e396B2cecb190E93eD2841Ba' as const
const other = '0x2222222222222222222222222222222222222222' as const
const key = '0xf634DDcC82EF49eA01Af7B28fBBB41A3217e396a' as const

test('account wallet can only build revokeKey with the card key and no value', () => {
  for (const network of ['testnet', 'mainnet'] as const) {
    const call = accountWalletRevokeCall(key, network, [key])
    const decoded = decodeFunctionData({ abi: Abis.accountKeychain, data: call.data })
    assert.equal(call.to, Addresses.accountKeychain)
    assert.equal(call.value, '0x0')
    assert.equal(decoded.functionName, 'revokeKey')
    assert.deepEqual(decoded.args, [key])
  }
})

test('account wallet rejects malformed and unloaded card keys before building a call', () => {
  assert.throws(() => accountWalletRevokeCall('not-an-address', 'testnet', [key]), /valid access key/)
  assert.throws(() => accountWalletRevokeCall('0x3333333333333333333333333333333333333333', 'mainnet', [key]), /not loaded for this account/)
  assert.doesNotThrow(() => accountWalletRevokeCall(key, 'mainnet', [key.toUpperCase(), key]))
})

test('connected wallet ownership controls the account-page action', () => {
  assert.equal(accountWalletMode('testnet', false, undefined, account), 'disconnected')
  assert.equal(accountWalletMode('mainnet', false, account, account), 'owner')
  assert.equal(accountWalletMode('mainnet', false, other, account), 'other')
  assert.equal(accountWalletEnabled('mainnet', true), false)
})

test('wallet chain must match the account page before signing', () => {
  assert.doesNotThrow(() => assertWalletChain('testnet', '0xa5bf', 42431))
  assert.doesNotThrow(() => assertWalletChain('mainnet', '0x1079', 4217))
  assert.throws(() => assertWalletChain('mainnet', '0xa5bf', 42431), /mainnet 4217/)
  assert.throws(() => assertWalletChain('testnet', '0x1079', 4217), /testnet 42431/)
})

test('demo and bank network guards reject mainnet', () => {
  assert.equal(demoChainAllowed(42431), true)
  assert.equal(demoChainAllowed(4217), false)
  assert.equal(accountWalletEnabled('mainnet', true), false)
})
