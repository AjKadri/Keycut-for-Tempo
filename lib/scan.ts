import { getAbiItem, toEventSelector, numberToHex, hexToBigInt, pad, http, type Address, type Hex } from 'viem'
import { tempo, tempoModerato } from 'viem/chains'
import { Abis, Addresses, createClient } from 'viem/tempo'
import { mergeRanges, type KeyEvent, type BlockRange } from './index'

export const chains = { testnet: tempoModerato, mainnet: tempo }
export type ChainName = keyof typeof chains
export const KEYCHAIN = Addresses.accountKeychain
const signatures = {
  authorized: toEventSelector(getAbiItem({ abi: Abis.accountKeychain, name: 'KeyAuthorized' })),
  admin: toEventSelector(getAbiItem({ abi: Abis.accountKeychain, name: 'AdminKeyAuthorized' })),
  revoked: toEventSelector(getAbiItem({ abi: Abis.accountKeychain, name: 'KeyRevoked' })),
}
const kinds = Object.fromEntries(Object.entries(signatures).map(([kind, signature]) => [signature, kind])) as Record<string, KeyEvent['kind']>
type RawLog = { topics: Hex[]; blockNumber: Hex }
type FetchLogs = (from: bigint, to: bigint) => Promise<RawLog[]>

// The public RPC rejects large batches and rate-limits overlapping batches.
// Queue small HTTP batches per network, retry 429 twice, and throw HTTP
// failures so viem doesn't treat a batch-level error object as an array.
const rpcQueues = new Map<string, Promise<void>>()
const rpcFetch: typeof fetch = (input, init) => {
  const url = String(input)
  const response = (rpcQueues.get(url) ?? Promise.resolve()).then(async () => {
    for (let attempt = 0; ; attempt++) {
      const result = await fetch(input, init)
      if (result.status === 429 && attempt < 2) {
        await result.body?.cancel()
        await new Promise((resolve) => setTimeout(resolve, 550))
        continue
      }
      if (!result.ok) { await result.body?.cancel(); throw new Error(`RPC HTTP ${result.status}`) }
      return result
    }
  })
  rpcQueues.set(url, response.then(() => {}, () => {}))
  return response
}

export const readClient = (name: ChainName) => createClient({
  chain: chains[name], cacheTime: 0,
  transport: http(undefined, { batch: { wait: 5, batchSize: 8 }, fetchFn: rpcFetch, timeout: 30_000, retryCount: 0 }),
})

export function fetchKeyLogs(client: ReturnType<typeof readClient>, account?: Address): FetchLogs {
  return (from, to) => client.request({ method: 'eth_getLogs', params: [{
    address: KEYCHAIN, fromBlock: numberToHex(from), toBlock: numberToHex(to),
    topics: [Object.values(signatures), ...(account ? [pad(account)] : [])],
  }] } as never) as Promise<RawLog[]>
}

// Ported from gates/index-probe.ts: 100k chunks, split refusals, three
// attempts at small ranges. Only successful ranges count as covered.
export async function collect(fetchLogs: FetchLogs, from: bigint, to: bigint, budgetMs: number) {
  const started = Date.now()
  const events: KeyEvent[] = [], covered: BlockRange[] = [], missing: BlockRange[] = []
  let requests = 0, splits = 0
  const queue: [bigint, bigint][] = []
  for (let lo = from; lo <= to; lo += 100_000n) queue.push([lo, lo + 99_999n < to ? lo + 99_999n : to])
  async function range(lo: bigint, hi: bigint): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (Date.now() - started >= budgetMs) { missing.push([Number(lo), Number(hi)]); return }
      try {
        requests++
        const logs = await fetchLogs(lo, hi)
        const decoded = logs.map((log) => {
          const kind = kinds[log.topics[0]!]
          if (!kind || log.topics.length < 3) throw new Error('Unexpected key event')
          return { block: Number(hexToBigInt(log.blockNumber)), kind,
            account: `0x${log.topics[1]!.slice(-40)}`, key: `0x${log.topics[2]!.slice(-40)}` }
        })
        events.push(...decoded)
        covered.push([Number(lo), Number(hi)])
        return
      } catch {
        if (hi - lo + 1n > 1_000n) {
          splits++
          const mid = lo + (hi - lo) / 2n
          await range(lo, mid)
          await range(mid + 1n, hi)
          return
        }
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
        else missing.push([Number(lo), Number(hi)])
      }
    }
  }
  async function worker() {
    for (;;) {
      const next = queue.shift()
      if (!next) return
      await range(...next)
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  return { events, coveredRanges: mergeRanges(covered), missingRanges: mergeRanges(missing),
    complete: missing.length === 0, requests, splits, elapsedMs: Date.now() - started }
}
