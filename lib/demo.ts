import { BaseError, RpcRequestError, parseUnits, type Address, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'
import { Abis, Account, Addresses, createClient } from 'viem/tempo'
import { keyStatus } from './permissions'
import { invalidateLookup } from './lookup'
import { sealSession, type DemoSession } from './demo-session'
import { DEMO_CHAIN_ID, demoChainAllowed } from './demo-network'

export const ALPHA: Address = '0x20c0000000000000000000000000000000000001'
export const txLink = (hash: Hex) => `https://explore.testnet.tempo.xyz/tx/${hash}`
export type DemoEvent = { type: 'transaction'; label: string; hash: Hex; url: string } |
  { type: 'ready'; account: Address; admin: Address; child: Address; vendor: Address; session: string } |
  { type: 'error'; error: string }
export const rootClient = (key: Hex) => createClient({ account: Account.fromSecp256k1(key), chain: tempoModerato, feeToken: ALPHA })
export function bankClient() {
  const key = process.env.KEYCUT_BANK_PRIVATE_KEY
  if (!key || !/^0x[\da-fA-F]{64}$/.test(key)) throw new Error('Demo unavailable. The testnet bank is not configured.')
  return rootClient(key as Hex)
}
async function testnet(client: ReturnType<typeof rootClient>) {
  if (!demoChainAllowed(await client.getChainId())) throw new Error(`Demo writes are allowed only on test network ${DEMO_CHAIN_ID}.`)
}
const locks = new Set<string>()
export async function withDemoLock<T>(account: string, action: () => Promise<T>) {
  if (locks.has(account)) throw new Error('A demo action is already running. Wait for it to finish.')
  locks.add(account)
  try { return await action() } finally { locks.delete(account) }
}
let bankQueue: Promise<unknown> = Promise.resolve()
async function fund(account: Address) {
  const work = bankQueue.then(async () => {
    const bank = bankClient()
    await testnet(bank)
    const balance = await bank.readContract({ address: ALPHA, abi: Abis.tip20, functionName: 'balanceOf', args: [bank.account.address] })
    if (balance < parseUnits('11', 6)) throw new Error('The testnet bank needs a top-up. You can still view the leftover example.')
    const hash = await bank.writeContract({ address: ALPHA, abi: Abis.tip20, functionName: 'transfer', args: [account, parseUnits('10', 6)], gas: 2_000_000n })
    const receipt = await bank.waitForTransactionReceipt({ hash, timeout: 60_000 })
    if (receipt.status !== 'success') throw new Error('Funding failed. Please try again later.')
    return hash
  })
  bankQueue = work.catch(() => {})
  return work
}
export async function createScenario(emit: (event: DemoEvent) => void, permanent = false) {
  const rootKey = generatePrivateKey(), childKey = generatePrivateKey()
  const root = Account.fromSecp256k1(rootKey)
  const admin = Account.fromSecp256k1(generatePrivateKey(), { access: root })
  const child = Account.fromSecp256k1(childKey, { access: root })
  const vendor = privateKeyToAddress(generatePrivateKey())
  const sender = rootClient(rootKey)
  await testnet(sender)
  const transactions: { label: string; hash: Hex; url: string }[] = []
  const record = (label: string, hash: Hex) => {
    const entry = { label, hash, url: txLink(hash) }; transactions.push(entry)
    emit({ type: 'transaction', ...entry })
  }
  record('Bank funded the fresh account with 10 test AlphaUSD', await fund(root.address))
  const expiry = BigInt(Math.floor(Date.now() / 1000) + (permanent ? 365 * 86400 : 7200))
  const keyIds: Address[] = [admin.accessKeyAddress, child.accessKeyAddress]
  if (!permanent) {
    const limited = Account.fromSecp256k1(generatePrivateKey(), { access: root })
    const risky = Account.fromSecp256k1(generatePrivateKey(), { access: root })
    keyIds.push(limited.accessKeyAddress, risky.accessKeyAddress)
    const limitedTx = await sender.accessKey.authorizeSync({ accessKey: limited, expiry: Number(expiry), limits: [{ token: ALPHA, limit: parseUnits('2', 6), period: 0 }], scopes: [{ address: ALPHA, selector: 'transfer(address,uint256)', recipients: [vendor] }] })
    record('Created a limited key', limitedTx.receipt.transactionHash)
    const riskyTx = await sender.accessKey.authorizeSync({ accessKey: risky })
    record('Created an unrestricted key for comparison', riskyTx.receipt.transactionHash)
  }
  const adminTx = await sender.accessKey.authorizeSync({ accessKey: admin, admin: true })
  record('Created the admin key', adminTx.receipt.transactionHash)
  const adminClient = createClient({ account: admin, chain: tempoModerato, feeToken: ALPHA })
  const hash = await adminClient.writeContract({ address: Addresses.accountKeychain, abi: Abis.accountKeychain, functionName: 'authorizeKey',
    args: [child.accessKeyAddress, 0, { expiry, enforceLimits: true,
      limits: [{ token: ALPHA, amount: parseUnits('3', 6), period: 0n }], allowAnyCalls: false,
      allowedCalls: [{ target: ALPHA, selectorRules: [{ selector: '0xa9059cbb', recipients: [vendor] }] }] }] })
  const receipt = await sender.waitForTransactionReceipt({ hash, timeout: 60_000 })
  if (receipt.status !== 'success') throw new Error('The child key could not be created.')
  record('Admin created a child key with a 3 AlphaUSD cap', hash)
  const revoked = await sender.accessKey.revokeSync({ accessKey: admin })
  record('Revoked the admin key', revoked.receipt.transactionHash)
  const [adminInfo, childInfo] = await Promise.all([admin, child].map(key => sender.readContract({ address: Addresses.accountKeychain, abi: Abis.accountKeychain, functionName: 'getKey', args: [root.address, key.accessKeyAddress] })))
  if (!adminInfo!.isRevoked || childInfo!.isRevoked) throw new Error('Could not confirm the leftover-key state.')
  invalidateLookup('testnet', root.address)
  const session: DemoSession = { chainId: 42431, root: rootKey, child: childKey, account: root.address, admin: admin.accessKeyAddress, childId: child.accessKeyAddress, vendor, keyIds, expires: Date.now() + 7200_000, phase: 'leftover' }
  return { session, transactions, expiry: expiry.toString() }
}
export async function payChild(session: DemoSession) {
  const sender = rootClient(session.root)
  await testnet(sender)
  const root = sender.account, child = Account.fromSecp256k1(session.child, { access: root })
  const childClient = createClient({ account: child, chain: tempoModerato, feeToken: ALPHA })
  const balance = () => sender.readContract({ address: ALPHA, abi: Abis.tip20, functionName: 'balanceOf', args: [session.vendor] })
  const before = await balance()
  let hash: Hex | undefined, nodeRefused = false
  try { hash = await childClient.writeContract({ address: ALPHA, abi: Abis.tip20, functionName: 'transfer', args: [session.vendor, parseUnits('1', 6)], gas: 2_000_000n }) }
  catch (error) { nodeRefused = error instanceof BaseError && Boolean(error.walk(e => e instanceof RpcRequestError) instanceof RpcRequestError) }
  if (hash) await sender.waitForTransactionReceipt({ hash, timeout: 60_000 })
  const after = await balance()
  const info = await sender.readContract({ address: Addresses.accountKeychain, abi: Abis.accountKeychain, functionName: 'getKey', args: [session.account, session.childId] })
  const delta = after - before
  const expectedRefusal = session.phase === 'revoked'
  if (expectedRefusal ? !(info.isRevoked && delta === 0n && (hash || nodeRefused)) : !(delta === parseUnits('1', 6) && !info.isRevoked)) {
    throw new Error('The payment outcome could not be confirmed. Check the account and try again later.')
  }
  invalidateLookup('testnet', session.account)
  return { session: sealSession({ ...session, phase: expectedRefusal ? 'finished' : 'paid' }),
    outcome: expectedRefusal ? 'refused' : 'paid', vendorReceived: delta.toString(), before: before.toString(), after: after.toString(),
    hash: hash ?? null, url: hash ? txLink(hash) : null,
    explanation: expectedRefusal ? 'The key was revoked, so the network refused the payment. The vendor received 0.' : 'The admin key is revoked, but its child still paid. The vendor received 1 test AlphaUSD.',
    submission: hash ? 'Transaction confirmed.' : 'The network refused the attempt before returning a transaction hash.' }
}
export async function revokeChild(session: DemoSession, keyId: Address = session.childId) {
  const sender = rootClient(session.root)
  await testnet(sender)
  if (!(session.keyIds ?? [session.childId]).some(key => key.toLowerCase() === keyId.toLowerCase())) throw new Error('This key was not issued by this demo.')
  const before = await sender.readContract({ address: Addresses.accountKeychain, abi: Abis.accountKeychain, functionName: 'getKey', args: [session.account, keyId] })
  const head = await sender.getBlock({ blockTag: 'latest' })
  if (keyStatus({ expiry: before.expiry.toString(), isRevoked: before.isRevoked }, Number(head.timestamp)) !== 'active') throw new Error('This key is already inactive.')
  const result = await sender.accessKey.revokeSync({ accessKey: keyId })
  const info = await sender.readContract({ address: Addresses.accountKeychain, abi: Abis.accountKeychain, functionName: 'getKey', args: [session.account, keyId] })
  if (!info.isRevoked) throw new Error('The child revocation could not be confirmed.')
  invalidateLookup('testnet', session.account)
  const hash = result.receipt.transactionHash
  const isChild = keyId.toLowerCase() === session.childId.toLowerCase()
  return { session: sealSession({ ...session, phase: isChild ? 'revoked' : session.phase }), hash, url: txLink(hash), explanation: `${isChild ? 'The child key' : 'This key'} is now revoked. It can no longer spend or make calls.` }
}
