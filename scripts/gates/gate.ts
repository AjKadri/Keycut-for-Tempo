/**
 * Earmark gate test (Tempo Moderato testnet).
 *
 * Question it answers: does the CHAIN refuse a helper's payment that breaks
 * the sender's rules, or is that only something the docs say?
 *
 * Setup: a sender-owned project account, a helper holding a restricted access
 * key (100 AlphaUSD one-time budget, transfers to two approved vendors only).
 *
 * Checks
 *   1. Helper pays approved vendor A (60) and vendor B (10)   -> must succeed
 *   2. Helper pays an unapproved address (5)                   -> must be refused
 *   3. Helper pays vendor A 50 more (over the 100 cap)         -> must be refused
 *   3b. Helper tries approve() to an unapproved spender        -> must be refused
 *   control: helper pays vendor B 5 after the refusals         -> must succeed
 *   4. Sender revokes the key, helper pays vendor B (5)        -> must be refused
 *
 * Every "refused" verdict is decided by on-chain balances and allowances, not
 * by an error message. Refused attempts are sent with a fixed gas limit so the
 * SDK cannot stop them client-side with a failed gas estimate; the same gas
 * limit is used for the payments that succeed, so a refusal is not just
 * "ran out of gas".
 *
 * Run:  npm install && npm run gate
 * Uses throwaway keys generated on each run and free faucet funds. Testnet only.
 */
import { writeFileSync } from 'node:fs'
import { parseUnits, formatUnits, type Address, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts'
import { tempoModerato } from 'viem/chains'
import { Abis, Account, createClient, P256 } from 'viem/tempo'

const ALPHA_USD: Address = '0x20c0000000000000000000000000000000000001'
const DECIMALS = 6
const usd = (n: string) => parseUnits(n, DECIMALS)
const show = (n: bigint) => formatUnits(n, DECIMALS)
const explorer = tempoModerato.blockExplorers?.default.url ?? 'https://explore.tempo.xyz'

type Row = {
  check: string
  expected: 'succeeds' | 'refused'
  observed: 'succeeded' | 'refused' | 'ERROR'
  pass: boolean
  how: string // which layer answered: included+success, included+reverted, node rejected, ...
  tx?: string
  detail?: string
}
const rows: Row[] = []

// ---------------------------------------------------------------- accounts
const root = Account.fromSecp256k1(generatePrivateKey()) // sender's project account
const helperKey = Account.fromP256(P256.randomPrivateKey(), { access: root }) // helper's restricted key
const vendorA = privateKeyToAddress(generatePrivateKey())
const vendorB = privateKeyToAddress(generatePrivateKey())
const outsider = privateKeyToAddress(generatePrivateKey()) // e.g. the helper's own wallet

const sender = createClient({ account: root, chain: tempoModerato, feeToken: ALPHA_USD })
const helper = createClient({ account: helperKey, chain: tempoModerato, feeToken: ALPHA_USD })

// ----------------------------------------------------------------- helpers
const balanceOf = (who: Address) =>
  sender.readContract({ address: ALPHA_USD, abi: Abis.tip20, functionName: 'balanceOf', args: [who] }) as Promise<bigint>

const allowanceOf = (owner: Address, spender: Address) =>
  sender.readContract({ address: ALPHA_USD, abi: Abis.tip20, functionName: 'allowance', args: [owner, spender] }) as Promise<bigint>

const short = (e: unknown) => {
  const err = e as { shortMessage?: string; details?: string; message?: string }
  return (err.shortMessage ?? err.details ?? err.message ?? String(e)).split('\n')[0]!.slice(0, 220)
}

let GAS = 2_000_000n // replaced by 3x a real estimate below, when estimation works

/** Sends one helper-signed call with a fixed gas limit and reports what the chain did with it. */
async function helperSend(fn: 'transfer' | 'approve', to: Address, amount: bigint) {
  let hash: Hex
  try {
    hash = await helper.writeContract({
      address: ALPHA_USD,
      abi: Abis.tip20,
      functionName: fn,
      args: [to, amount],
      gas: GAS,
    })
  } catch (e) {
    return { how: 'node rejected the signed transaction', detail: short(e) }
  }
  try {
    const receipt = await sender.waitForTransactionReceipt({ hash, timeout: 60_000 })
    return {
      how: receipt.status === 'success' ? 'included, success' : 'included, reverted',
      tx: `${explorer}/tx/${hash}`,
    }
  } catch (e) {
    return { how: 'submitted but never included', tx: `${explorer}/tx/${hash}`, detail: short(e) }
  }
}

/** A payment that must arrive: verdict is the recipient's balance going up by exactly `amount`. */
async function expectPaid(check: string, to: Address, amount: bigint) {
  const before = await balanceOf(to)
  const r = await helperSend('transfer', to, amount)
  const delta = (await balanceOf(to)) - before
  const ok = delta === amount
  rows.push({ check, expected: 'succeeds', observed: ok ? 'succeeded' : 'refused', pass: ok, ...r,
    detail: r.detail ?? `recipient received ${show(delta)}` })
}

/** A payment that must NOT arrive: verdict is recipient and project balances showing no payment. */
async function expectRefused(check: string, to: Address, amount: bigint) {
  const [toBefore, rootBefore] = await Promise.all([balanceOf(to), balanceOf(root.address)])
  const r = await helperSend('transfer', to, amount)
  const [toAfter, rootAfter] = await Promise.all([balanceOf(to), balanceOf(root.address)])
  const moved = toAfter - toBefore
  const ok = moved === 0n && rootBefore - rootAfter < amount // project account lost at most a fee
  rows.push({ check, expected: 'refused', observed: ok ? 'refused' : 'succeeded', pass: ok, ...r,
    detail: r.detail ?? `recipient received ${show(moved)}; project account changed by -${show(rootBefore - rootAfter)}` })
}

// -------------------------------------------------------------------- run
async function main() {
  console.log(`Network: ${tempoModerato.name} (chain ${tempoModerato.id})`)
  console.log(`Project account (sender-owned): ${root.address}`)
  console.log(`Vendor A ${vendorA}\nVendor B ${vendorB}\nOutsider ${outsider}\n`)

  // 0. Reach the network and fund the project account from the faucet.
  const chainId = await sender.getChainId()
  if (chainId !== tempoModerato.id) throw new Error(`Wrong chain: got ${chainId}`)
  await sender.faucet.fundSync({ account: root.address, timeout: 60_000 })
  const funded = await balanceOf(root.address)
  console.log(`Faucet funded project account with ${show(funded)} AlphaUSD`)
  if (funded < usd('150')) throw new Error('Faucet gave less than 150 AlphaUSD; cannot run the checks.')

  // Sender issues the helper's key: 100 AlphaUSD one-time budget, 1 hour,
  // transfers only, to vendor A or B only. No approve scope on purpose.
  const auth = await sender.accessKey.authorizeSync({
    accessKey: helperKey,
    expiry: Math.floor(Date.now() / 1000) + 3600,
    limits: [{ token: ALPHA_USD, limit: usd('100'), period: 0 }],
    scopes: [
      { address: ALPHA_USD, selector: 'transfer(address,uint256)', recipients: [vendorA, vendorB] },
      { address: ALPHA_USD, selector: 'transferWithMemo(address,uint256,bytes32)', recipients: [vendorA, vendorB] },
    ],
  })
  console.log(`Key issued: ${explorer}/tx/${auth.receipt.transactionHash}\n`)

  // One gas limit for every helper call, taken from a real allowed payment.
  try {
    const est = await helper.estimateContractGas({
      address: ALPHA_USD, abi: Abis.tip20, functionName: 'transfer', args: [vendorA, usd('60')],
    })
    GAS = est * 3n > 1_000_000n ? est * 3n : 1_000_000n
  } catch (e) {
    console.log(`(gas estimate failed, using ${GAS}: ${short(e)})`)
  }

  await expectPaid('1a. Pay approved vendor A 60', vendorA, usd('60'))
  await expectPaid('1b. Pay approved vendor B 10', vendorB, usd('10'))
  await expectRefused('2.  Pay unapproved address 5', outsider, usd('5'))
  await expectRefused('3.  Pay vendor A 50 more (over the 100 cap)', vendorA, usd('50'))

  // 3b. approve() would let another address pull funds later, bypassing the vendor list.
  {
    const r = await helperSend('approve', outsider, usd('5'))
    const allowance = await allowanceOf(root.address, outsider)
    const ok = allowance === 0n
    rows.push({ check: '3b. approve() to unapproved spender', expected: 'refused',
      observed: ok ? 'refused' : 'succeeded', pass: ok, ...r,
      detail: r.detail ?? `allowance now ${show(allowance)}` })
  }

  // Control: the key still works for an allowed payment, so the refusals above
  // were about the rules, not a broken key or a bad gas limit.
  await expectPaid('ctl. Pay approved vendor B 5 (key still works)', vendorB, usd('5'))

  const { remaining } = await sender.accessKey.getRemainingLimit({ accessKey: helperKey, token: ALPHA_USD })
  console.log(`Budget left on the key: ${show(remaining)} of 100 (spent 75 on payments; any gap is fees)\n`)

  // 4. Sender revokes; the same allowed payment must now fail.
  const rev = await sender.accessKey.revokeSync({ accessKey: helperKey })
  console.log(`Key revoked: ${explorer}/tx/${rev.receipt.transactionHash}`)
  await expectRefused('4.  Pay vendor B 5 after revoke', vendorB, usd('5'))
}

main()
  .catch((e) => {
    rows.push({ check: 'SCRIPT STOPPED', expected: 'succeeds', observed: 'ERROR', pass: false, how: 'exception', detail: short(e) })
  })
  .finally(() => {
    console.log('\n================ RESULT ================')
    for (const r of rows) {
      console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.check}`)
      console.log(`      expected ${r.expected}, observed ${r.observed} (${r.how})`)
      if (r.detail) console.log(`      ${r.detail}`)
      if (r.tx) console.log(`      ${r.tx}`)
    }
    const ran = rows.filter((r) => r.observed !== 'ERROR').length
    const allPass = rows.length >= 7 && rows.every((r) => r.pass)
    console.log(`\n${allPass ? 'GATE PASSED' : 'GATE NOT PASSED'}: ${rows.filter((r) => r.pass).length} of 7 checks passed (${ran} ran)`)
    writeFileSync('gate-result.json', JSON.stringify({ network: tempoModerato.name, chainId: tempoModerato.id,
      projectAccount: root.address, vendorA, vendorB, outsider, gasLimit: GAS.toString(), allPass, rows }, null, 2))
    console.log('Saved gate-result.json')
    process.exit(allPass ? 0 : 1)
  })
