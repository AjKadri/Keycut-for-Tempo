/**
 * Keywatch gate test (Tempo Moderato testnet).
 *
 * Decides between two builds:
 *   - Keywatch  (needs checks 1, 2, 5 and 7: finding keys from an address alone)
 *   - SpendTest (needs checks 3, 4 and 6: the chain's behaviour under attack)
 *
 * Setup: one account with four keys, created here by plain scripts, not by any app:
 *   K1 limited key   100 AlphaUSD, transfers to vendor A or B only, 1 hour
 *   K2 risky key     no spending cap, no call restrictions, no expiry
 *   K3 admin key     can create and revoke other keys
 *   K4 child key     created BY the admin key: 20 AlphaUSD, vendor A only
 *
 * Checks
 *   1. Find all four keys knowing only the account address
 *   2. Permissions read back from the chain match what was set
 *   3. Child key pays vendor A (control)                         -> must succeed
 *   4. Admin key revoked; child key pays vendor A again          -> spec says it still succeeds
 *   5. Discovery now shows the admin revoked and the child still active
 *   6. Child key revoked; child pays vendor A                    -> must be refused
 *   7. History: the log scan reaches block 0 inside the time budget
 *   (probe, not counted) Tempo's hosted indexer: does it answer, and with what columns?
 *
 * Payment verdicts come from on-chain balances, not from error messages.
 *
 * Run:  npm install && npm run keywatch
 * Optional: TEMPO_API_KEY=... to include a key in the indexer probe.
 * Uses throwaway keys and free faucet funds. Testnet only.
 */
import { writeFileSync } from 'node:fs'
import {
  parseUnits, formatUnits, getAbiItem, toEventSelector, pad, numberToHex, hexToBigInt,
  type Address, type Hex,
} from 'viem'
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'
import { Abis, Account, Addresses, createClient } from 'viem/tempo'

const ALPHA_USD: Address = '0x20c0000000000000000000000000000000000001'
const KEYCHAIN = Addresses.accountKeychain as Address
const TRANSFER_SELECTOR = '0xa9059cbb'
const SCAN_BUDGET_MS = 120_000
const usd = (n: string) => parseUnits(n, 6)
const show = (n: bigint) => formatUnits(n, 6)
const explorer = tempoModerato.blockExplorers?.default.url ?? 'https://explore.tempo.xyz'
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const tail = (a: string) => a.slice(-4)

type Row = { check: string; pass: boolean; detail: string; tx?: string }
const rows: Row[] = []
const notes: string[] = []

// ---------------------------------------------------------------- accounts
const root = Account.fromSecp256k1(generatePrivateKey())
const k1 = Account.fromSecp256k1(generatePrivateKey(), { access: root }) // limited
const k2 = Account.fromSecp256k1(generatePrivateKey(), { access: root }) // risky
const k3 = Account.fromSecp256k1(generatePrivateKey(), { access: root }) // admin
const k4 = Account.fromSecp256k1(generatePrivateKey(), { access: root }) // child, created by k3
const vendorA = privateKeyToAddress(generatePrivateKey())
const vendorB = privateKeyToAddress(generatePrivateKey())
const NAMES: Record<string, string> = {
  [k1.accessKeyAddress.toLowerCase()]: 'K1 limited',
  [k2.accessKeyAddress.toLowerCase()]: 'K2 risky',
  [k3.accessKeyAddress.toLowerCase()]: 'K3 admin',
  [k4.accessKeyAddress.toLowerCase()]: 'K4 child',
}

const mk = (account: typeof root | typeof k1) => createClient({ account, chain: tempoModerato, feeToken: ALPHA_USD })
const sender = mk(root)
const adminClient = mk(k3)
const childClient = mk(k4)
const k1Client = mk(k1)

// ----------------------------------------------------------------- helpers
const short = (e: unknown) => {
  const err = e as { shortMessage?: string; details?: string; message?: string }
  return (err.shortMessage ?? err.details ?? err.message ?? String(e)).split('\n')[0]!.slice(0, 240)
}
const balanceOf = (who: Address) =>
  sender.readContract({ address: ALPHA_USD, abi: Abis.tip20, functionName: 'balanceOf', args: [who] }) as Promise<bigint>

let GAS = 2_000_000n

async function pay(client: typeof childClient, to: Address, amount: bigint) {
  let hash: Hex
  try {
    hash = await client.writeContract({
      address: ALPHA_USD, abi: Abis.tip20, functionName: 'transfer', args: [to, amount], gas: GAS,
    })
  } catch (e) {
    return { how: `node rejected the signed transaction: ${short(e)}` }
  }
  try {
    const r = await sender.waitForTransactionReceipt({ hash, timeout: 60_000 })
    return { how: r.status === 'success' ? 'included, success' : 'included, reverted', tx: `${explorer}/tx/${hash}` }
  } catch (e) {
    return { how: `submitted but never included: ${short(e)}`, tx: `${explorer}/tx/${hash}` }
  }
}

async function expectPaid(check: string, client: typeof childClient, to: Address, amount: bigint) {
  const before = await balanceOf(to)
  const r = await pay(client, to, amount)
  const delta = (await balanceOf(to)) - before
  rows.push({ check, pass: delta === amount, detail: `recipient received ${show(delta)} (${r.how})`, tx: r.tx })
}

async function expectRefused(check: string, client: typeof childClient, to: Address, amount: bigint) {
  const before = await balanceOf(to)
  const r = await pay(client, to, amount)
  const delta = (await balanceOf(to)) - before
  rows.push({ check, pass: delta === 0n, detail: `recipient received ${show(delta)} (${r.how})`, tx: r.tx })
}

// --------------------------------------------------------------- discovery
// The only input is the account address. Keys are found from the keychain's
// own events, filtered by that address on the node.
const SIG = {
  authorized: toEventSelector(getAbiItem({ abi: Abis.accountKeychain, name: 'KeyAuthorized' })),
  admin: toEventSelector(getAbiItem({ abi: Abis.accountKeychain, name: 'AdminKeyAuthorized' })),
  revoked: toEventSelector(getAbiItem({ abi: Abis.accountKeychain, name: 'KeyRevoked' })),
}
type RawLog = { topics: Hex[]; blockNumber: Hex; transactionHash: Hex }

const rawLogs = (account: Address, from: bigint, to: bigint) =>
  sender.request({
    method: 'eth_getLogs',
    params: [{
      address: KEYCHAIN,
      fromBlock: numberToHex(from),
      toBlock: numberToHex(to),
      topics: [[SIG.authorized, SIG.admin, SIG.revoked], pad(account)],
    }],
  } as never) as Promise<RawLog[]>

type Scan = {
  logs: RawLog[]; latest: bigint; coveredFrom: bigint; complete: boolean
  requests: number; ms: number; method: string; stoppedBecause?: string
}

async function scan(account: Address, opts: { stopAt?: bigint; budgetMs?: number } = {}): Promise<Scan> {
  const stopAt = opts.stopAt ?? 0n
  const budget = opts.budgetMs ?? SCAN_BUDGET_MS
  const t0 = Date.now()
  const latest = await sender.getBlockNumber()
  let requests = 0

  // 1. One call for the whole range. Cheapest if the node allows it.
  try {
    requests++
    const logs = await rawLogs(account, stopAt, latest)
    return { logs, latest, coveredFrom: stopAt, complete: true, requests, ms: Date.now() - t0, method: 'one request for the whole range' }
  } catch (e) {
    notes.push(`Whole-range log request refused: ${short(e)}`)
  }

  // 2. Find the largest block range the node accepts, newest blocks first.
  let chunk = 0n
  let logs: RawLog[] = []
  let cursor = latest
  for (const size of [1_000_000n, 100_000n, 10_000n, 2_000n, 500n]) {
    const from = latest - size + 1n > stopAt ? latest - size + 1n : stopAt
    try {
      requests++
      logs = await rawLogs(account, from, latest)
      chunk = size
      cursor = from - 1n
      break
    } catch { /* try a smaller range */ }
  }
  if (chunk === 0n) {
    return { logs: [], latest, coveredFrom: latest, complete: false, requests, ms: Date.now() - t0,
      method: 'no block range accepted', stoppedBecause: 'node refused every range size tried' }
  }

  // 3. Walk backwards in parallel until block 0 or the time budget runs out.
  let stoppedBecause: string | undefined
  while (cursor >= stopAt) {
    if (Date.now() - t0 > budget) { stoppedBecause = `time budget of ${budget / 1000}s reached`; break }
    const batch: [bigint, bigint][] = []
    for (let i = 0; i < 4 && cursor >= stopAt; i++) {
      const from = cursor - chunk + 1n > stopAt ? cursor - chunk + 1n : stopAt
      batch.push([from, cursor])
      cursor = from - 1n
    }
    try {
      requests += batch.length
      const got = await Promise.all(batch.map(([f, t]) => rawLogs(account, f, t)))
      logs = logs.concat(...got)
    } catch (e) {
      await new Promise((r) => setTimeout(r, 1500)) // one retry, e.g. after a rate limit
      try {
        requests += batch.length
        const got = await Promise.all(batch.map(([f, t]) => rawLogs(account, f, t)))
        logs = logs.concat(...got)
      } catch (e2) {
        stoppedBecause = `node error mid-scan: ${short(e2)}`
        cursor = batch[0]![1] // nothing in this batch is confirmed covered
        break
      }
    }
  }
  const coveredFrom = stoppedBecause ? cursor + 1n : stopAt
  return { logs, latest, coveredFrom, complete: !stoppedBecause, requests, ms: Date.now() - t0,
    method: `${chunk.toLocaleString()}-block requests, 4 at a time`, stoppedBecause }
}

type Found = { key: Address; admin: boolean; revokedByEvent: boolean; block: bigint; tx: Hex }
function keysFrom(logs: RawLog[]): Found[] {
  const map = new Map<string, Found>()
  const sorted = [...logs].sort((a, b) => Number(hexToBigInt(a.blockNumber) - hexToBigInt(b.blockNumber)))
  for (const l of sorted) {
    const key = (`0x${l.topics[2]!.slice(-40)}`) as Address
    const id = key.toLowerCase()
    const cur = map.get(id) ?? { key, admin: false, revokedByEvent: false, block: hexToBigInt(l.blockNumber), tx: l.transactionHash }
    if (l.topics[0] === SIG.admin) cur.admin = true
    if (l.topics[0] === SIG.revoked) cur.revokedByEvent = true
    map.set(id, cur)
  }
  return [...map.values()]
}

/** Reads one key's live permissions from the chain and describes them in plain words. */
async function describe(account: Address, key: Address) {
  const read = (functionName: string, args: unknown[]) =>
    sender.readContract({ address: KEYCHAIN, abi: Abis.accountKeychain, functionName, args } as never) as Promise<any>
  const info = await read('getKey', [account, key])
  const isAdmin = (await read('isAdminKey', [account, key]).catch(() => false)) as boolean
  const [isScoped, scopes] = (await read('getAllowedCalls', [account, key])) as [boolean, { target: Address; selectorRules: { selector: Hex; recipients: Address[] }[] }[]]
  const [remaining, periodEnd] = (await read('getRemainingLimitWithPeriod', [account, key, ALPHA_USD])) as [bigint, bigint]
  const expiry = BigInt(info.expiry)
  const neverExpires = expiry === 0n || expiry > 4_000_000_000n
  const words: string[] = []
  const risks: string[] = []
  if (info.isRevoked) words.push('REVOKED')
  if (isAdmin) { words.push('admin: can create and revoke other keys'); risks.push('admin key') }
  if (info.enforceLimits) words.push(`can spend ${show(remaining)} more AlphaUSD${periodEnd > 0n ? ' this period' : ''}`)
  else if (!isAdmin) { words.push('no spending cap'); risks.push('no spending cap') }
  if (!isScoped) { if (!isAdmin) { words.push('can call anything'); risks.push('no call restrictions') } }
  else if (scopes.length === 0) words.push('cannot make any call')
  else for (const s of scopes) {
    if (s.selectorRules.length === 0) { words.push(`any function on ${tail(s.target)}`); risks.push('any function on a token') }
    for (const r of s.selectorRules) {
      if (r.recipients.length === 0) { words.push(`${r.selector} to ANY recipient`); risks.push('empty recipient list means anyone') }
      else words.push(`${same(r.selector, TRANSFER_SELECTOR) ? 'transfer' : r.selector} only to ${r.recipients.map(tail).join(', ')}`)
    }
  }
  words.push(neverExpires ? 'never expires' : `expires ${new Date(Number(expiry) * 1000).toISOString()}`)
  if (neverExpires && !info.isRevoked) risks.push('never expires')
  return { key, isAdmin, isRevoked: info.isRevoked as boolean, enforceLimits: info.enforceLimits as boolean, expiry,
    isScoped, scopes, remaining, text: words.join('; '), risks }
}

// ---------------------------------------------------------- indexer probe
async function probeIndexer(account: Address) {
  const signature = 'KeyAuthorized(address indexed account, address indexed publicKey, uint8 signatureType, uint64 expiry)'
  const tries = [
    `SELECT * FROM keyauthorized WHERE account = '${account}' LIMIT 5`,
    `SELECT * FROM KeyAuthorized WHERE account = '${account}' LIMIT 5`,
    `SELECT * FROM logs WHERE address = '${KEYCHAIN}' LIMIT 2`,
  ]
  const key = process.env.TEMPO_API_KEY
  const headers: Record<string, string> = key ? { authorization: `Bearer ${key}`, 'x-api-key': key } : {}
  for (const sql of tries) {
    const url = `https://tempo.xyz/v1/indexer/query?${new URLSearchParams({ chainId: String(tempoModerato.id), signature, sql })}`
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
      const body = (await res.text()).replace(/\s+/g, ' ').slice(0, 400)
      notes.push(`Indexer probe [${sql.slice(0, 40)}...] -> HTTP ${res.status}: ${body}`)
      if (res.ok) return
    } catch (e) {
      notes.push(`Indexer probe [${sql.slice(0, 40)}...] -> failed: ${short(e)}`)
    }
  }
}

// -------------------------------------------------------------------- run
async function main() {
  console.log(`Network: ${tempoModerato.name} (chain ${tempoModerato.id})`)
  console.log(`Account under test: ${root.address}\n`)

  if ((await sender.getChainId()) !== tempoModerato.id) throw new Error('Wrong chain')
  await sender.faucet.fundSync({ account: root.address, timeout: 60_000 })
  if ((await balanceOf(root.address)) < usd('150')) throw new Error('Faucet gave less than 150 AlphaUSD')

  const expiry = Math.floor(Date.now() / 1000) + 3600
  // K1, K2, K3 are issued by the account owner.
  await sender.accessKey.authorizeSync({
    accessKey: k1, expiry,
    limits: [{ token: ALPHA_USD, limit: usd('100'), period: 0 }],
    scopes: [{ address: ALPHA_USD, selector: 'transfer(address,uint256)', recipients: [vendorA, vendorB] }],
  })
  await sender.accessKey.authorizeSync({ accessKey: k2 })
  await sender.accessKey.authorizeSync({ accessKey: k3, admin: true })
  console.log('Owner issued K1 (limited), K2 (risky), K3 (admin)')

  // K4 is issued by the admin key, not the owner.
  let childMadeByAdmin = false
  try {
    const hash = await adminClient.writeContract({
      address: KEYCHAIN, abi: Abis.accountKeychain, functionName: 'authorizeKey',
      args: [k4.accessKeyAddress, 0, {
        expiry: BigInt(expiry), enforceLimits: true,
        limits: [{ token: ALPHA_USD, amount: usd('20'), period: 0n }],
        allowAnyCalls: false,
        allowedCalls: [{ target: ALPHA_USD, selectorRules: [{ selector: TRANSFER_SELECTOR, recipients: [vendorA] }] }],
      }],
    } as never)
    const r = await sender.waitForTransactionReceipt({ hash, timeout: 60_000 })
    childMadeByAdmin = r.status === 'success'
    console.log(`Admin key issued K4 (child): ${r.status}  ${explorer}/tx/${hash}`)
  } catch (e) {
    notes.push(`Admin key could not issue the child key: ${short(e)}`)
    console.log(`Admin key could NOT issue the child key: ${short(e)}`)
  }

  // ---- Check 1 + 7: one full scan, knowing only the address.
  const full = await scan(root.address)
  const found = keysFrom(full.logs)
  const wanted = [k1, k2, k3, k4].map((k) => k.accessKeyAddress)
  const missing = wanted.filter((w) => !found.some((f) => same(f.key, w)))
  rows.push({
    check: '1. Find all four keys from the address alone',
    pass: missing.length === 0,
    detail: `found ${found.length} key(s)${missing.length ? `, missing ${missing.map((m) => NAMES[m.toLowerCase()]).join(', ')}` : ''}; ${full.method}; ${full.requests} request(s), ${full.ms} ms`,
  })
  const coverage = `covered blocks ${full.coveredFrom.toLocaleString()} to ${full.latest.toLocaleString()}` +
    (full.complete ? ' (complete)' : ` (PARTIAL: ${full.stoppedBecause})`)

  // ---- Check 2: live permissions match what was set.
  console.log('\nWhat each key can do, read from the chain:')
  const d: Record<string, Awaited<ReturnType<typeof describe>>> = {}
  for (const f of found) {
    const info = await describe(root.address, f.key)
    d[f.key.toLowerCase()] = info
    console.log(`  ${NAMES[f.key.toLowerCase()] ?? 'unknown key'} (${tail(f.key)}): ${info.text}`)
    if (info.risks.length) console.log(`      risk flags: ${info.risks.join(', ')}`)
  }
  const g = (k: typeof k1) => d[k.accessKeyAddress.toLowerCase()]
  const recips = (k: typeof k1) => (g(k)?.scopes[0]?.selectorRules[0]?.recipients ?? []).map((r) => r.toLowerCase()).sort().join()
  const problems: string[] = []
  const d1 = g(k1), d2 = g(k2), d3 = g(k3), d4 = g(k4)
  if (!d1 || !d1.enforceLimits || d1.remaining !== usd('100')) problems.push('K1 cap is not 100')
  if (!d1 || d1.expiry !== BigInt(expiry)) problems.push('K1 expiry differs')
  if (!d1 || recips(k1) !== [vendorA, vendorB].map((r) => r.toLowerCase()).sort().join()) problems.push('K1 recipients differ')
  if (!d2 || d2.enforceLimits || d2.isScoped) problems.push('K2 should read as uncapped and unrestricted')
  if (!d3 || !d3.isAdmin) problems.push('K3 should read as admin')
  if (!d4 || d4.remaining !== usd('20') || recips(k4) !== vendorA.toLowerCase()) problems.push('K4 cap or recipient differs')
  rows.push({ check: '2. Permissions read back match what was set', pass: problems.length === 0,
    detail: problems.length ? problems.join('; ') : 'all four keys read back correctly' })

  // ---- Checks 3, 4, 6: the leftover key.
  try {
    const est = await k1Client.estimateContractGas({ address: ALPHA_USD, abi: Abis.tip20, functionName: 'transfer', args: [vendorA, usd('5')] })
    GAS = est * 3n > 1_000_000n ? est * 3n : 1_000_000n
  } catch (e) { notes.push(`Gas estimate failed, using ${GAS}: ${short(e)}`) }

  if (!childMadeByAdmin) {
    for (const c of ['3. Child key pays before admin is revoked', '4. Admin revoked, child key still pays', '6. Child revoked, child payment refused'])
      rows.push({ check: c, pass: false, detail: 'not run: the admin key could not issue the child key' })
  } else {
    await expectPaid('3. Child key pays before admin is revoked', childClient, vendorA, usd('5'))
    const rev = await sender.accessKey.revokeSync({ accessKey: k3 })
    console.log(`\nAdmin key K3 revoked: ${explorer}/tx/${rev.receipt.transactionHash}`)
    await expectPaid('4. Admin revoked, child key still pays', childClient, vendorA, usd('5'))
  }

  // ---- Check 5: discovery reflects the new state (scan limited to this run's blocks).
  const startBlock = found.reduce((m, f) => (f.block < m ? f.block : m), full.latest)
  const again = keysFrom((await scan(root.address, { stopAt: startBlock, budgetMs: 30_000 })).logs)
  const a3 = again.find((f) => same(f.key, k3.accessKeyAddress))
  const a4 = again.find((f) => same(f.key, k4.accessKeyAddress))
  const live3 = await describe(root.address, k3.accessKeyAddress)
  const live4 = childMadeByAdmin ? await describe(root.address, k4.accessKeyAddress) : undefined
  rows.push({
    check: '5. Discovery shows admin revoked and child still active',
    pass: !!a3?.revokedByEvent && live3.isRevoked && !!a4 && !a4.revokedByEvent && !!live4 && !live4.isRevoked,
    detail: `admin: event ${a3?.revokedByEvent ? 'revoked' : 'not revoked'}, chain ${live3.isRevoked ? 'revoked' : 'active'}; ` +
      `child: ${a4 ? `event ${a4.revokedByEvent ? 'revoked' : 'active'}` : 'not found'}, chain ${live4 ? (live4.isRevoked ? 'revoked' : 'active') : 'n/a'}`,
  })

  if (childMadeByAdmin) {
    const rev = await sender.accessKey.revokeSync({ accessKey: k4 })
    console.log(`Child key K4 revoked: ${explorer}/tx/${rev.receipt.transactionHash}`)
    await expectRefused('6. Child revoked, child payment refused', childClient, vendorA, usd('5'))
  }
  rows.sort((a, b) => a.check.localeCompare(b.check))

  // ---- Check 7: history.
  rows.push({ check: `7. Log scan reaches block 0 within ${SCAN_BUDGET_MS / 1000}s`, pass: full.complete,
    detail: `${coverage}; ${full.requests} request(s), ${full.ms} ms` })

  await probeIndexer(root.address)
}

main()
  .catch((e) => { rows.push({ check: 'SCRIPT STOPPED', pass: false, detail: short(e) }) })
  .finally(() => {
    console.log('\n================ RESULT ================')
    for (const r of rows) {
      console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.check}`)
      console.log(`      ${r.detail}`)
      if (r.tx) console.log(`      ${r.tx}`)
    }
    if (notes.length) { console.log('\nNotes'); for (const n of notes) console.log(`  - ${n}`) }
    const ok = (n: string) => rows.some((r) => r.check.startsWith(n) && r.pass)
    const keywatch = ok('1.') && ok('2.') && ok('5.') && ok('7.')
    const spendtest = ok('3.') && ok('4.') && ok('6.')
    console.log(`\nKeywatch discovery (checks 1, 2, 5, 7): ${keywatch ? 'PASSED' : 'NOT PASSED'}`)
    console.log(`Leftover-key behaviour (checks 3, 4, 6): ${spendtest ? 'PASSED' : 'NOT PASSED'}`)
    console.log(keywatch ? 'Decision: build Keywatch.' : spendtest ? 'Decision: build SpendTest.' : 'Decision: neither is proven yet. Send the output.')
    writeFileSync('keywatch-gate-result.json', JSON.stringify({ network: tempoModerato.name, chainId: tempoModerato.id,
      account: root.address, vendorA, vendorB, keywatch, spendtest, rows, notes }, null, 2))
    console.log('Saved keywatch-gate-result.json')
    process.exit(keywatch || spendtest ? 0 : 1)
  })
