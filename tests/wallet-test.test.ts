import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeFunctionData } from 'viem'
import { Abis, Addresses } from 'viem/tempo'
import { walletTestCall, walletTestSigner } from '../lib/wallet-test'
const key = '0x1111111111111111111111111111111111111111'
test('wallet test requests only the two intended keychain calls on testnet with zero value', () => {
 const authorize = walletTestCall('authorize', key, 12345n)
 assert.equal(authorize.to, Addresses.accountKeychain); assert.equal(authorize.chainId, '0xa5bf'); assert.equal(authorize.value, '0x0')
 const decoded = decodeFunctionData({ abi: Abis.accountKeychain, data: authorize.data })
 assert.equal(decoded.functionName, 'authorizeKey')
 assert.deepEqual(decoded.args, [key, 0, { expiry: 12345n, enforceLimits: false, limits: [], allowAnyCalls: true, allowedCalls: [] }])
 const cut = decodeFunctionData({ abi: Abis.accountKeychain, data: walletTestCall('revoke', key).data })
 assert.equal(cut.functionName, 'revokeKey'); assert.deepEqual(cut.args, [key])
 assert.throws(() => walletTestCall('authorize', key), /expiry/)
})
test('signing evidence distinguishes main key, access key, and missing or unknown evidence', () => {
 assert.match(walletTestSigner({ type: 'webAuthn' }), /main key/)
 assert.match(walletTestSigner({ type: 'secp256k1' }), /main key/)
 assert.match(walletTestSigner({ type: 'p256' }), /main key/)
 assert.match(walletTestSigner({ type: 'keychain', keyId: key }), /Session\/access key/)
 assert.match(walletTestSigner({ userAddress: key, signature: { type: 'secp256k1' }, keyId: key, version: 'v2' }), /Session\/access key/)
 assert.match(walletTestSigner({ userAddress: 'bad', signature: { type: 'secp256k1' } }), /Unverified/)
 assert.match(walletTestSigner(undefined), /Unverified/)
 assert.match(walletTestSigner({ type: 'multisig' }), /Unverified/)
})
