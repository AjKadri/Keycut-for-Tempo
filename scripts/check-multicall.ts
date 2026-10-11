import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { multicall } from 'viem/actions'
import type { Address } from 'viem'
import { Abis } from 'viem/tempo'
import { readClient, chains, KEYCHAIN, type ChainName } from '../lib/scan'

const multicallAddress = '0xcA11bde05977b3631167028862bE2a173976CA11' as const
const known = '0x907B843c995E9332caf4A0A832B2B1fbCD1E9477' as Address
let failed = false
for (const name of ['testnet', 'mainnet'] as ChainName[]) {
  try {
    const client = readClient(name), blockNumber = await client.getBlockNumber()
    const code = await client.getCode({ address: multicallAddress, blockNumber })
    assert.ok(code && code !== '0x', 'Multicall3 has no bytecode')
    console.log(`PASS ${name}: eth_getCode found ${((code.length - 2) / 2)} bytes at block ${blockNumber}`)
    const accounts = name === 'testnet' ? [known] : [known, '0x07fbca218b0a0a35244e0025a036fa85a6dc97dc' as Address]
    for (const account of accounts) {
      // Known testnet IDs are also checked on mainnet, even though that account
      // has no keys there. Additionally compare a real mainnet indexed key.
      const shard = JSON.parse(await readFile(`public/index/${name === 'mainnet' && account === known ? 42431 : chains[name].id}/${account.slice(2, 4).toLowerCase()}.json`, 'utf8'))
      const keys = (shard[account.toLowerCase()] as [Address, number, number][]).slice(0, account === known ? 4 : 1)
      const contracts = keys.flatMap(([key]) => [
        { address: KEYCHAIN as Address, abi: Abis.accountKeychain, functionName: 'getKey' as const, args: [account, key] as const },
        { address: KEYCHAIN as Address, abi: Abis.accountKeychain, functionName: 'isAdminKey' as const, args: [account, key] as const },
        { address: KEYCHAIN as Address, abi: Abis.accountKeychain, functionName: 'getAllowedCalls' as const, args: [account, key] as const },
        { address: KEYCHAIN as Address, abi: Abis.accountKeychain, functionName: 'getRemainingLimitWithPeriod' as const,
          args: [account, key, (name === 'testnet' ? '0x20c0000000000000000000000000000000000001' : '0x20c0000000000000000000000000000000000000') as Address] as const },
      ])
      const direct = await Promise.all(contracts.map(contract => client.readContract({ ...contract, blockNumber } as Parameters<typeof client.readContract>[0])))
      const batched = await multicall(client, { contracts, multicallAddress, batchSize: 0, allowFailure: false, blockNumber })
      assert.deepEqual(batched, direct)
      console.log(`PASS ${name}: all four permission functions match direct reads for ${account} (${keys.length} keys)`)
    }
  } catch (error) {
    failed = true
    console.error(`FAIL ${name}: ${(error as Error).message.split('\n')[0]}`)
  }
}
if (failed) process.exitCode = 1
