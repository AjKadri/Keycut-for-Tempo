/**
 * Keycut index probe (read-only, no keys, no funds).
 *
 * The gate showed that finding one account's keys by scanning the chain live
 * takes about 2.5 minutes. This answers the follow-up: can Keycut build ONE
 * index of every key on the network, so any address lookup is instant?
 *
 *   A. Tempo's hosted indexer, at the correct host this time (api.tempo.xyz)
 *   B. A full scan of every key event on the chain into key-index.json:
 *      how long, how many requests, how many events, and is it complete?
 *   C. Lookup of one account in that index (default: the gate's test account)
 *   D. Cost of keeping the index fresh (scan only the blocks added since B)
 *
 * Run:   npm run index                      (testnet)
 *        npm run index -- --mainnet         (mainnet, still read-only)
 *        npm run index -- 0xYourAddress     (look up a different account)
 *        npm run index -- --selftest        (checks the scan logic against a fake node)
 * Optional: TEMPO_API_KEY=... for the indexer probe.
 */
import { writeFileSync } from 'node:fs'
import { getAbiItem, toEventSelector, numberToHex, hexToBigInt, type Address, type Hex } from 'viem'
import { tempo, tempoModerato } from 'viem/chains'
import { Abis, Addresses, createClient } from 'viem/tempo'

const args = process.argv.slice(2)
const MAINNET = args.includes('--mainnet')
const SELFTEST = args.includes('--selftest')
const LOOKUP = (args.find((a) => /^0x[0-9a-fA-F]{40}$/.test(a)) ?? '0x907B843c995E9332caf4A0A832B2B1fbCD1E9477') as Address
const chain = MAINNET ? tempo : tempoModerato
const KEYCHAIN = Addresses.accountKeychain as Address
const CHUNK = 100_000n
const MIN_CHUNK = 1_000n
const CONCURRENCY = 8
const BUDGET_MS = 15 * 60_000

const SIG = {
  authorized: toEventSelector(getAbiItem({ abi: Abis.accountKeychain, name: 'KeyAuthorized' })),
  admin: toEventSelector(getAbiItem({ abi: Abis.accountKeychain, name: 'AdminKeyAuthorized' })),
  revoked: toEventSelector(getAbiItem({ abi: Abis.accountKeychain, name: 'KeyRevoked' })),
}
const KIND: Record<string, 'authorized' | 'admin' | 'revoked'> = {
  [SIG.authorized]: 'authorized', [SIG.admin]: 'admin', [SIG.revoked]: 'revoked',
}
type RawLog = { topics: Hex[]; blockNumber: Hex }
type Event = { block: number; kind: 'authorized' | 'admin' | 'revoked'; account: string; key: string }
type Fetch = (from: bigint, to: bigint) => Promise<RawLog[]>

const short = (e: unknown) => {
  const err = e as { shortMessage?: string; details?: string; message?: string }
  return (err.shortMessage ?? err.details ?? err.message ?? String(e)).split('\n')[0]!.slice(0, 200)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Collects every key event in [from, to]. A range the node refuses is split
 * in half until it is accepted; a range is only counted as covered once the
 * node has answered for all of it.
 */
async function collect(fetchLogs: Fetch, from: bigint, to: bigint, budgetMs: number) {
  const t0 = Date.now()
  const events: Event[] = []
  const failed: [bigint, bigint][] = []
  let requests = 0, splits = 0, skippedForTime = 0n

  const queue: [bigint, bigint][] = []
  for (let hi = to; hi >= from; hi -= CHUNK) queue.push([hi - CHUNK + 1n > from ? hi - CHUNK + 1n : from, hi])

  async function range(f: bigint, t: bigint): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        requests++
        for (const l of await fetchLogs(f, t)) {
          const kind = KIND[l.topics[0]!]
          if (!kind) continue
          events.push({ block: Number(hexToBigInt(l.blockNumber)), kind,
            account: `0x${l.topics[1]!.slice(-40)}`, key: `0x${l.topics[2]!.slice(-40)}` })
        }
        return
      } catch (e) {
        if (t - f + 1n > MIN_CHUNK) { // too big or too many results: split and retry both halves
          splits++
          const mid = f + (t - f) / 2n
          await range(mid + 1n, t)
          await range(f, mid)
          return
        }
        await sleep(1000 * (attempt + 1))
        if (attempt === 2) { failed.push([f, t]); console.log(`  gave up on blocks ${f}-${t}: ${short(e)}`) }
      }
    }
  }

  async function worker() {
    for (;;) {
      const next = queue.shift()
      if (!next) return
      if (Date.now() - t0 > budgetMs) { skippedForTime += next[1] - next[0] + 1n; continue }
      await range(next[0], next[1])
      if (requests % 40 === 0) console.log(`  ... ${requests} requests, ${events.length} events, ${Math.round((Date.now() - t0) / 1000)}s`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  const missing = failed.reduce((n, [f, t]) => n + (t - f + 1n), 0n) + skippedForTime
  return { events, requests, splits, ms: Date.now() - t0, complete: missing === 0n, missingBlocks: missing, failed }
}

function lookup(events: Event[], account: string) {
  const keys = new Map<string, { key: string; admin: boolean; revoked: boolean; firstBlock: number }>()
  for (const e of [...events].sort((a, b) => a.block - b.block)) {
    if (e.account.toLowerCase() !== account.toLowerCase()) continue
    const k = keys.get(e.key) ?? { key: e.key, admin: false, revoked: false, firstBlock: e.block }
    if (e.kind === 'admin') k.admin = true
    if (e.kind === 'revoked') k.revoked = true
    keys.set(e.key, k)
  }
  return [...keys.values()]
}

// ----------------------------------------------------------------- selftest
async function selftest() {
  const LATEST = 1_234_567n
  const logAt = (b: bigint, kind: Hex, acct: string, key: string): RawLog =>
    ({ blockNumber: numberToHex(b), topics: [kind, `0x${acct.padStart(64, '0')}` as Hex, `0x${key.padStart(64, '0')}` as Hex] })
  const A = 'a'.repeat(40), B = 'b'.repeat(40)
  const all = [
    logAt(0n, SIG.authorized, A, '1'.repeat(40)), logAt(499_999n, SIG.authorized, A, '2'.repeat(40)),
    logAt(500_000n, SIG.admin, A, '2'.repeat(40)), logAt(900_001n, SIG.revoked, A, '1'.repeat(40)),
    logAt(1_234_567n, SIG.authorized, B, '3'.repeat(40)), logAt(650_000n, SIG.authorized, B, '4'.repeat(40)),
  ]
  const seen: [bigint, bigint][] = []
  let calls = 0
  const fake: Fetch = async (f, t) => {
    calls++
    if (f <= 650_000n && t >= 650_000n && t - f + 1n > 20_000n) throw new Error('too many results') // a busy stretch forces splitting
    if (calls % 7 === 0 && t - f + 1n <= MIN_CHUNK) throw new Error('rate limited')
    seen.push([f, t])
    return all.filter((l) => hexToBigInt(l.blockNumber) >= f && hexToBigInt(l.blockNumber) <= t)
  }
  const r = await collect(fake, 0n, LATEST, 60_000)
  seen.sort((a, b) => Number(a[0] - b[0]))
  let expect = 0n, gaps = 0, overlaps = 0
  for (const [f, t] of seen) { if (f > expect) gaps++; if (f < expect) overlaps++; expect = t + 1n }
  const a = lookup(r.events, `0x${A}`)
  const ok = r.events.length === all.length && gaps === 0 && overlaps === 0 && expect - 1n === LATEST && r.complete
    && a.length === 2 && a.some((k) => k.revoked) && a.some((k) => k.admin) && r.splits > 0
  console.log({ events: r.events.length, expected: all.length, gaps, overlaps, coveredToLatest: expect - 1n === LATEST,
    complete: r.complete, splits: r.splits, accountAKeys: a.length })
  console.log(ok ? 'SELFTEST PASSED' : 'SELFTEST FAILED')
  process.exit(ok ? 0 : 1)
}

// ------------------------------------------------------------ indexer probe
async function probeIndexer() {
  console.log('A. Hosted indexer (api.tempo.xyz)')
  const key = process.env.TEMPO_API_KEY
  const headers: Record<string, string> = key ? { authorization: `Bearer ${key}` } : {}
  const signature = 'KeyAuthorized(address indexed account, address indexed publicKey, uint8 signatureType, uint64 expiry)'
  const tries: [string, Record<string, string>][] = [
    ['documented example (blocks)', { sql: 'SELECT num, hash, timestamp FROM blocks ORDER BY num DESC LIMIT 2' }],
    ['event table, lower case', { signature, sql: `SELECT * FROM keyauthorized WHERE account = '${LOOKUP}' LIMIT 5` }],
    ['event table, as written', { signature, sql: `SELECT * FROM KeyAuthorized WHERE account = '${LOOKUP}' LIMIT 5` }],
    ['raw logs table', { sql: `SELECT * FROM logs WHERE address = '${KEYCHAIN}' LIMIT 2` }],
  ]
  for (const [label, params] of tries) {
    const url = `https://api.tempo.xyz/v1/indexer/query?${new URLSearchParams({ chainId: String(chain.id), ...params })}`
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) })
      const body = (await res.text()).replace(/\s+/g, ' ').slice(0, 500)
      console.log(`  ${label}: HTTP ${res.status} ${body}`)
    } catch (e) { console.log(`  ${label}: failed (${short(e)})`) }
  }
  console.log(key ? '' : '  (no TEMPO_API_KEY set; a 401 here means the indexer needs one)\n')
}

// --------------------------------------------------------------------- run
async function main() {
  console.log(`Network: ${chain.name} (chain ${chain.id})\n`)
  const client = createClient({ chain })
  const fetchLogs: Fetch = (from, to) =>
    client.request({
      method: 'eth_getLogs',
      params: [{ address: KEYCHAIN, fromBlock: numberToHex(from), toBlock: numberToHex(to),
        topics: [[SIG.authorized, SIG.admin, SIG.revoked]] }],
    } as never) as Promise<RawLog[]>

  await probeIndexer()

  console.log(`B. Full scan of every key event (${CONCURRENCY} requests at a time, up to ${BUDGET_MS / 60_000} min)`)
  const latest = await client.getBlockNumber()
  const full = await collect(fetchLogs, 0n, latest, BUDGET_MS)
  const accounts = new Set(full.events.map((e) => e.account)).size
  const keys = new Set(full.events.map((e) => `${e.account}:${e.key}`)).size
  console.log(`  ${full.complete ? 'COMPLETE' : 'PARTIAL'}: blocks 0 to ${latest.toLocaleString()} in ${Math.round(full.ms / 1000)}s`)
  console.log(`  ${full.requests} requests, ${full.splits} range splits, ${full.events.length.toLocaleString()} events`)
  console.log(`  ${keys.toLocaleString()} keys across ${accounts.toLocaleString()} accounts`)
  if (!full.complete) console.log(`  NOT covered: ${full.missingBlocks.toLocaleString()} blocks`)

  console.log(`\nC. Lookup of ${LOOKUP}`)
  const mine = lookup(full.events, LOOKUP)
  for (const k of mine) console.log(`  key ...${k.key.slice(-4)}  ${k.admin ? 'admin  ' : 'limited'}  ${k.revoked ? 'revoked' : 'active '}  first seen block ${k.firstBlock.toLocaleString()}`)
  console.log(`  ${mine.length} key(s) found${MAINNET ? '' : ' (the gate account should show 4, two of them revoked)'}`)

  console.log('\nD. Keeping the index fresh')
  const t0 = Date.now()
  const now = await client.getBlockNumber()
  const delta = now > latest ? await collect(fetchLogs, latest + 1n, now, 60_000) : undefined
  console.log(`  ${(now - latest).toLocaleString()} new blocks scanned in ${Date.now() - t0} ms${delta ? `, ${delta.events.length} new event(s)` : ''}`)

  const file = `key-index-${chain.id}.json`
  const json = JSON.stringify({ chainId: chain.id, completeThroughBlock: Number(latest), complete: full.complete,
    missingBlocks: full.missingBlocks.toString(), builtAt: new Date().toISOString(), events: full.events })
  writeFileSync(file, json)
  console.log(`\nSaved ${file} (${(json.length / 1_048_576).toFixed(1)} MB)`)

  const verdict = full.complete && (MAINNET || mine.length >= 4)
  console.log(`\n${verdict ? 'INDEX IS FEASIBLE' : 'INDEX NOT PROVEN'}: ${full.complete ? 'full history covered' : 'history incomplete'}, ` +
    `built in ${Math.round(full.ms / 1000)}s, ${(json.length / 1_048_576).toFixed(1)} MB`)
  process.exit(verdict ? 0 : 1)
}

;(SELFTEST ? selftest() : main()).catch((e) => { console.log(`STOPPED: ${short(e)}`); process.exit(1) })
