import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Address } from 'viem'
import { Abis } from 'viem/tempo'
import { chains, readClient, collect, fetchKeyLogs, KEYCHAIN, type ChainName } from './scan'
import { mergeEvents, mergeRanges, type IndexMeta, type Shard } from './index'
import { describePermissions, type KeyPermissions } from './permissions'
import tokenSnapshot from './known-tokens.json'

export const PAGE_SIZE = 25
export const KNOWN_ACCOUNT = '0x907B843c995E9332caf4A0A832B2B1fbCD1E9477' as Address

// Share the exact same path between the public API and the CLI verifier.
export async function lookupKeys(name: ChainName, address: Address, page = 1) {
  const account = address.toLowerCase() as Address
  const chain = chains[name], client = readClient(name)
  const directory = path.join(process.cwd(), 'public', 'index', String(chain.id))
  const meta = JSON.parse(await readFile(path.join(directory, 'meta.json'), 'utf8')) as IndexMeta
  if (!meta.complete || meta.chainId !== chain.id) throw new Error('A complete index for this chain is unavailable')
  const shard = JSON.parse(await readFile(path.join(directory, `${account.slice(2, 4)}.json`), 'utf8')) as Shard
  const latest = Number(await client.getBlockNumber())
  if (latest < meta.completeThroughBlock) throw new Error('RPC is behind the index snapshot')
  const topUp = await collect(fetchKeyLogs(client, account), BigInt(meta.completeThroughBlock + 1), BigInt(latest), 12_000)
  const entries = mergeEvents({ [account]: shard[account] ?? [] }, topUp.events)[account] ?? []
  const coveredRanges = mergeRanges([[0, meta.completeThroughBlock], ...topUp.coveredRanges])
  const completeThroughBlock = coveredRanges[0]![1]
  const blockNumber = BigInt(latest)
  const tokens = tokenSnapshot.tokens.filter((token) => token.chainId === chain.id)
  let readsComplete = true
  const keys = []
  const selected = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  // Four keys at a time. HTTP batching coalesces their read calls without
  // relying on a multicall contract. Reads use the same captured block.
  for (let offset = 0; offset < selected.length; offset += 4) {
    keys.push(...await Promise.all(selected.slice(offset, offset + 4).map(async ([key, firstSeenBlock, eventFlags]) => {
      const keyId = key as Address
      const base = { address: KEYCHAIN, abi: Abis.accountKeychain, blockNumber } as const
      try {
        const [info, isAdmin, [isScoped, scopes]] = await Promise.all([
          client.readContract({ ...base, functionName: 'getKey', args: [account, keyId] }),
          client.readContract({ ...base, functionName: 'isAdminKey', args: [account, keyId] }),
          client.readContract({ ...base, functionName: 'getAllowedCalls', args: [account, keyId] }),
        ])
        // No remaining-limit reads are meaningful when the chain explicitly
        // says this key doesn't enforce a spending cap (including tombstones).
        const limits = info.enforceLimits ? await Promise.all(tokens.map(async ({ chainId: _, ...token }) => {
            const [remaining, periodEnd] = await client.readContract({ ...base,
              functionName: 'getRemainingLimitWithPeriod', args: [account, keyId, token.address as Address] })
            return { ...token, remaining: remaining.toString(), periodEnd: periodEnd.toString() }
          })) : []
        const raw: KeyPermissions = { ...info, expiry: info.expiry.toString(), isAdmin,
          wasAdmin: Boolean(eventFlags & 1), isScoped, scopes, limits }
        return { key: keyId, firstSeenBlock, eventFlags, ...describePermissions(raw, Math.floor(Date.now() / 1000)),
          limitReads: info.enforceLimits ? 'known stablecoins only' : 'not applicable: no spending cap enforced', raw }
      } catch (error) {
        console.error('Key permission read failed', keyId, (error as Error).message.split('\n')[0])
        readsComplete = false
        return { key: keyId, firstSeenBlock, eventFlags, status: 'unavailable' as const,
          sentence: "This key's permissions couldn't be read. Try again.", riskFlags: [], raw: null }
      }
    })))
  }
  const complete = topUp.complete && readsComplete
  return { chain: name, chainId: chain.id, account, page, pageSize: PAGE_SIZE,
    totalKeys: entries.length, totalPages: Math.ceil(entries.length / PAGE_SIZE), keys,
    complete, discoveryComplete: topUp.complete, readsComplete, completeThroughBlock,
    coveredRanges, missingRanges: topUp.missingRanges, latestBlock: latest, permissionsAtBlock: latest,
    snapshot: { builtAt: meta.builtAt, completeThroughBlock: meta.completeThroughBlock },
    checkedAt: new Date().toISOString(), limitsCoverage: 'known stablecoins only',
    tokenList: { source: tokenSnapshot.source, retrievedAt: tokenSnapshot.retrievedAt, tokens },
    coverageSentence: `${complete ? 'Complete' : 'Partial result'}. ${entries.length} keys found. History covered through block ${completeThroughBlock}${topUp.missingRanges.length ? `. Missing ranges: ${topUp.missingRanges.map(([from, to]) => `${from} to ${to}`).join(', ')}` : ''}.${readsComplete ? '' : ' Some live permissions are unavailable.'}`,
  }
}

// Cache completed pages for 30 seconds, including concurrent requests.
// Bound memory so arbitrary public addresses don't grow the cache forever.
const cache = new Map<string, { expires: number; result: ReturnType<typeof lookupKeys> }>()
export function cachedLookup(name: ChainName, address: Address, page: number) {
  const id = `${name}:${address.toLowerCase()}:${page}`
  const prior = cache.get(id)
  if (prior && prior.expires > Date.now()) return prior.result
  if (cache.size >= 200) cache.delete(cache.keys().next().value!)
  const result = lookupKeys(name, address, page)
  cache.set(id, { expires: Date.now() + 30_000, result })
  void result.then((data) => { if (!data.complete && cache.get(id)?.result === result) cache.delete(id) },
    () => { if (cache.get(id)?.result === result) cache.delete(id) })
  return result
}
