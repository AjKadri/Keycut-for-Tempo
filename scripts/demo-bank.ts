import { readFile, writeFile } from 'node:fs/promises'
import { Abis } from 'viem/tempo'
import { formatUnits } from 'viem'
import { bankClient, ALPHA, createScenario } from '../lib/demo'

const action = process.argv[2] ?? 'status'
const client = bankClient()
if (await client.getChainId() !== 42431) throw new Error('Refusing writes outside testnet 42431')
console.log(`Testnet bank ${client.account.address}`)
if (action === 'top-up') {
  await client.faucet.fundSync({ account: client.account.address, timeout: 60_000 })
  console.log('Faucet topped up the bank only.')
} else if (action === 'example') {
  const file = 'lib/leftover-example.json'
  const existing = JSON.parse(await readFile(file, 'utf8'))
  if (existing.account) throw new Error('A permanent example already exists. Refusing to create another.')
  const { session, transactions, expiry } = await createScenario(event => {
    if (event.type === 'transaction') console.log(`${event.label}: ${event.url}`)
  }, true)
  // Public evidence only. No private keys or session token are written.
  await writeFile(file, JSON.stringify({ account: session.account, admin: session.admin, child: session.childId, vendor: session.vendor,
    chainId: 42431, expiry, createdAt: new Date().toISOString(), transactions }, null, 2) + '\n')
  console.log(`Permanent leftover example ${session.account}`)
} else if (action !== 'status') throw new Error('Use status, top-up or example')
const balance = await client.readContract({ address: ALPHA, abi: Abis.tip20, functionName: 'balanceOf', args: [client.account.address] })
console.log(`Bank balance ${formatUnits(balance, 6)} test AlphaUSD`)
