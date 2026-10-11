import { multicall } from 'viem/actions'
import type { Address } from 'viem'
import { Abis } from 'viem/tempo'
import { KEYCHAIN, readClient, type ChainName } from './scan'
import { keyStatus, type KeyPermissions, type KnownToken, type PermissionScope } from './permissions'

export const MULTICALL_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as const
// eth_getCode and same-block parity passed on both networks, 11 Oct 2026.
// Reproduce before enabling another chain with scripts/check-multicall.ts.
const verifiedChains: ChainName[] = ['testnet', 'mainnet']
type KeyInfo = { signatureType: number; keyId: Address; expiry: bigint; enforceLimits: boolean; isRevoked: boolean }
type ReadResult = { status: 'success'; result: unknown } | { status: 'failure' }

export async function readPagePermissions(client: ReturnType<typeof readClient>, name: ChainName, account: Address,
  keys: readonly Address[], tokens: KnownToken[], blockNumber: bigint, nowSeconds: number) {
  let method: 'multicall3' | 'direct' = verifiedChains.includes(name) ? 'multicall3' : 'direct'
  const base = { address: KEYCHAIN, abi: Abis.accountKeychain } as const
  async function read(contracts: Parameters<typeof multicall>[1]['contracts']): Promise<ReadResult[]> {
    if (!contracts.length) return []
    if (method === 'multicall3') {
      try {
        const values = await multicall(client, { contracts, multicallAddress: MULTICALL_ADDRESS, batchSize: 0, blockNumber, allowFailure: false })
        return values.map(result => ({ status: 'success' as const, result }))
      }
      catch (error) {
        console.error('Multicall unavailable; using direct reads', name, (error as Error).message.split('\n')[0])
        method = 'direct'
      }
    }
    const results: ReadResult[] = []
    // Preserve a bounded direct-read path if a network can't use Multicall3.
    for (let offset = 0; offset < contracts.length; offset += 8) {
      const settled = await Promise.allSettled(contracts.slice(offset, offset + 8).map(contract =>
        client.readContract({ ...(contract as Parameters<typeof client.readContract>[0]), blockNumber })))
      results.push(...settled.map(result => result.status === 'fulfilled'
        ? { status: 'success' as const, result: result.value } : { status: 'failure' as const }))
    }
    return results
  }
  const profiles = await read(keys.flatMap(key => [
    { ...base, functionName: 'getKey', args: [account, key] },
    { ...base, functionName: 'isAdminKey', args: [account, key] },
    { ...base, functionName: 'getAllowedCalls', args: [account, key] },
  ]))
  const permissions: (KeyPermissions | null)[] = keys.map((_, index) => {
    const [infoResult, adminResult, scopesResult] = profiles.slice(index * 3, index * 3 + 3)
    if (infoResult?.status !== 'success' || adminResult?.status !== 'success' || scopesResult?.status !== 'success') return null
    // Positions follow the three functions above; viem decodes each with its ABI.
    const info = infoResult.result as KeyInfo
    const [isScoped, scopes] = scopesResult.result as readonly [boolean, readonly PermissionScope[]]
    return { ...info, expiry: info.expiry.toString(), isAdmin: adminResult.result as boolean, wasAdmin: false,
      isScoped, scopes, limits: [] }
  })
  const capped = permissions.flatMap((raw, index) => raw && keyStatus(raw, nowSeconds) === 'active' && raw.enforceLimits ? [index] : [])
  const allowances = await read(capped.flatMap(index => tokens.map(token => ({ ...base,
    functionName: 'getRemainingLimitWithPeriod', args: [account, keys[index]!, token.address as Address] }))))
  for (let offset = 0; offset < capped.length; offset++) {
    const index = capped[offset]!, results = allowances.slice(offset * tokens.length, (offset + 1) * tokens.length)
    if (results.some(result => result.status === 'failure') || results.length !== tokens.length) { permissions[index] = null; continue }
    permissions[index]!.limits = tokens.map((token, i) => {
      const [remaining, periodEnd] = (results[i] as { status: 'success'; result: readonly [bigint, bigint] }).result
      return { ...token, remaining: remaining.toString(), periodEnd: periodEnd.toString() }
    })
  }
  return { permissions, method }
}
