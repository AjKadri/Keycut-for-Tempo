import { parseUnits, type Address, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'
import { Abis, Account, Addresses, createClient } from 'viem/tempo'
import { KNOWN_ACCOUNT, lookupKeys } from '../lib/lookup'

let failures = 0
function claim(label: string, passed: boolean, detail: string) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}: ${detail}`)
  if (!passed) failures++
}

async function verifyLookup() {
  const result = await lookupKeys('testnet', KNOWN_ACCOUNT)
  console.log(`Account ${result.account}`)
  console.log(`Covered block ranges: ${JSON.stringify(result.coveredRanges)}`)
  console.log(`Missing block ranges: ${JSON.stringify(result.missingRanges)}`)
  console.log(`Index through ${result.snapshot.completeThroughBlock}, top-up through ${result.completeThroughBlock}, latest ${result.latestBlock}`)
  for (const key of result.keys) console.log(`  ${key.key}: ${key.sentence}`)
  const expected = [
    '0x41b142c978180857c80b67811ed907d74c7518bb', '0x1d630522b708af1e90977a94e54a6913c29cf08b',
    '0x475e6c6258a467a2ef6fe88f06913cdfb333f1ec', '0x084297246fad9e6955ace17ae626305c2ce99235',
  ]
  claim('Product finds the four known keys from the address', result.totalKeys === 4 &&
    expected.every((key) => result.keys.some((found) => found.key === key)), `${result.totalKeys} keys found using the product index plus top-up`)
  claim('Two known keys are revoked', result.keys.filter((key) => key.status === 'revoked').length === 2,
    `${result.keys.filter((key) => key.status === 'revoked').length} revoked keys`)
  claim('Discovery covers all history through the latest captured block', result.discoveryComplete && result.completeThroughBlock === result.latestBlock,
    result.coverageSentence)
  claim('Live permissions are available', result.readsComplete, `permissions read at block ${result.permissionsAtBlock}`)
}

async function verifyLeftoverKey() {
  // Fresh seeded test data on Moderato only. Never accept an external key.
  const token: Address = '0x20c0000000000000000000000000000000000001'
  const root = Account.fromSecp256k1(generatePrivateKey())
  const admin = Account.fromSecp256k1(generatePrivateKey(), { access: root })
  const child = Account.fromSecp256k1(generatePrivateKey(), { access: root })
  const vendor = privateKeyToAddress(generatePrivateKey())
  const sender = createClient({ account: root, chain: tempoModerato, feeToken: token })
  const adminClient = createClient({ account: admin, chain: tempoModerato, feeToken: token })
  const childClient = createClient({ account: child, chain: tempoModerato, feeToken: token })
  if (await sender.getChainId() !== 42431) throw new Error('Refusing writes outside testnet 42431')
  console.log(`Fresh throwaway testnet account ${root.address}, seeded with faucet funds`)
  await sender.faucet.fundSync({ account: root.address, timeout: 60_000 })
  await sender.accessKey.authorizeSync({ accessKey: admin, admin: true })
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600)
  const hash = await adminClient.writeContract({
    address: Addresses.accountKeychain, abi: Abis.accountKeychain, functionName: 'authorizeKey',
    args: [child.accessKeyAddress, 0, {
      expiry, enforceLimits: true, limits: [{ token, amount: parseUnits('20', 6), period: 0n }],
      allowAnyCalls: false,
      allowedCalls: [{ target: token, selectorRules: [{ selector: '0xa9059cbb', recipients: [vendor] }] }],
    }],
  })
  const issued = await sender.waitForTransactionReceipt({ hash, timeout: 60_000 })
  claim('Admin key issues the child key', issued.status === 'success', `https://explore.testnet.tempo.xyz/tx/${hash}`)
  if (issued.status !== 'success') throw new Error('Child authorization failed')

  const balance = () => sender.readContract({ address: token, abi: Abis.tip20, functionName: 'balanceOf', args: [vendor] })
  async function payment() {
    const before = await balance()
    let hash: Hex | undefined
    try {
      hash = await childClient.writeContract({ address: token, abi: Abis.tip20,
        functionName: 'transfer', args: [vendor, parseUnits('1', 6)], gas: 2_000_000n })
    } catch {
      // A node error alone never determines the verdict. Read balances below.
    }
    if (hash) {
      // A timeout is unknown, so it fails verification rather than being
      // mistaken for a refused payment that could still arrive later.
      await sender.waitForTransactionReceipt({ hash, timeout: 60_000 })
      console.log(`Payment https://explore.testnet.tempo.xyz/tx/${hash}`)
    }
    return (await balance()) - before
  }
  const control = await payment()
  claim('Child pays before revocation', control === parseUnits('1', 6), `vendor balance change ${control} base units`)
  if (control !== parseUnits('1', 6)) throw new Error('Payment control failed')
  const adminRevoked = await sender.accessKey.revokeSync({ accessKey: admin })
  console.log(`Admin revoke https://explore.testnet.tempo.xyz/tx/${adminRevoked.receipt.transactionHash}`)
  const adminInfo = await sender.readContract({ address: Addresses.accountKeychain, abi: Abis.accountKeychain,
    functionName: 'getKey', args: [root.address, admin.accessKeyAddress] })
  const afterAdmin = await payment()
  claim('Child still pays after its admin key is revoked', adminInfo.isRevoked && afterAdmin === parseUnits('1', 6),
    `admin revoked=${adminInfo.isRevoked}, vendor balance change ${afterAdmin} base units`)
  if (!adminInfo.isRevoked || afterAdmin !== parseUnits('1', 6)) throw new Error('Post-admin payment control failed')
  const childRevoked = await sender.accessKey.revokeSync({ accessKey: child })
  console.log(`Child revoke https://explore.testnet.tempo.xyz/tx/${childRevoked.receipt.transactionHash}`)
  const info = await sender.readContract({ address: Addresses.accountKeychain, abi: Abis.accountKeychain,
    functionName: 'getKey', args: [root.address, child.accessKeyAddress] })
  const afterChild = await payment()
  claim('Revoking the child stops its payment', info.isRevoked && afterChild === 0n,
    `revoked=${info.isRevoked}, vendor balance change ${afterChild} base units`)
}

for (const [label, verify] of [['Product lookup', verifyLookup], ['Leftover-key case', verifyLeftoverKey]] as const) {
  try { await verify() } catch (error) { claim(label, false, (error as Error).message.split('\n')[0]!) }
}
process.exitCode = failures ? 1 : 0
