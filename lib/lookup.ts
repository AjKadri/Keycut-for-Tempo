import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { Address } from 'viem'
import { readPagePermissions } from './permission-reads'
import { chains, readClient, collect, fetchKeyLogs, type ChainName } from './scan'
import { mergeEvents, mergeRanges, type IndexMeta, type Shard } from './index'
import { describePermissions } from './permissions'
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
  const head = await client.getBlock({ blockTag: 'latest' })
  const latest = Number(head.number), nowSeconds = Number(head.timestamp)
  if (latest < meta.completeThroughBlock) throw new Error('RPC is behind the index snapshot')
  const topUp = await collect(fetchKeyLogs(client, account), BigInt(meta.completeThroughBlock + 1), BigInt(latest), 12_000)
  const entries = mergeEvents({ [account]: shard[account] ?? [] }, topUp.events)[account] ?? []
  const coveredRanges = mergeRanges([[0, meta.completeThroughBlock], ...topUp.coveredRanges])
  const completeThroughBlock = coveredRanges[0]![1]
  const blockNumber = BigInt(latest)
  const tokens = tokenSnapshot.tokens.filter((token) => token.chainId === chain.id)
  const selected = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const { permissions, method } = await readPagePermissions(client, name, account,
    selected.map(([key]) => key as Address), tokens, blockNumber, nowSeconds)
  const keys = selected.map(([key, firstSeenBlock, eventFlags], index) => {
    const raw = permissions[index]
    if (!raw) return { key, firstSeenBlock, eventFlags, status: 'unavailable' as const,
      sentence: "This key's permissions couldn't be read. Try again.", riskFlags: [], raw: null,
      limitReads: 'unavailable' }
    raw.wasAdmin = Boolean(eventFlags & 1)
    const description = describePermissions(raw, nowSeconds)
    return { key, firstSeenBlock, eventFlags, ...description, raw,
      limitReads: description.status !== 'active' ? `not read: key is ${description.status}`
        : raw.enforceLimits ? 'known stablecoins only' : 'not applicable: no spending cap enforced' }
  })
  const readsComplete = permissions.every(raw => raw !== null)
  const complete = topUp.complete && readsComplete
  return { chain: name, chainId: chain.id, account, page, pageSize: PAGE_SIZE,
    totalKeys: entries.length, totalPages: Math.ceil(entries.length / PAGE_SIZE), keys,
    complete, discoveryComplete: topUp.complete, readsComplete, completeThroughBlock,
    coveredRanges, missingRanges: topUp.missingRanges, latestBlock: latest, permissionsAtBlock: latest,
    permissionsAtTimestamp: nowSeconds, permissionReadMethod: method,
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

export function invalidateLookup(name: ChainName, address: Address) {
  const prefix = `${name}:${address.toLowerCase()}:`
  for (const id of cache.keys()) if (id.startsWith(prefix)) cache.delete(id)
}
