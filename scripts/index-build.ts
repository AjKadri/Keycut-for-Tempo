import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import path from 'node:path'
import { chains, readClient, collect, fetchKeyLogs, type ChainName } from '../lib/scan'
import { mergeEvents, type Shard, type KeyEvent, type IndexMeta } from '../lib/index'

async function main() {
  const name = process.argv[process.argv.indexOf('--chain') + 1]
  if (name !== 'testnet' && name !== 'mainnet') throw new Error('Use --chain testnet|mainnet')
  await build(name)
}

async function build(name: ChainName) {
  const chain = chains[name], directory = path.join(process.cwd(), 'public', 'index', String(chain.id))
  const shardNames = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'))
  let shard: Shard = {}, through = -1, source: IndexMeta['source'] = { kind: 'scan' }
  let meta: IndexMeta | undefined
  try {
    meta = JSON.parse(await readFile(path.join(directory, 'meta.json'), 'utf8')) as IndexMeta
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (meta) {
    if (!meta.complete || meta.chainId !== chain.id) throw new Error('Existing index metadata is invalid')
    through = meta.completeThroughBlock
    source = meta.source
    for (const prefix of shardNames) Object.assign(shard, JSON.parse(await readFile(path.join(directory, `${prefix}.json`), 'utf8')))
    console.log(`Incremental build from block ${through + 1}`)
  } else {
    const file = path.join(process.cwd(), `key-index-${chain.id}.json`)
    try {
      const saved = JSON.parse(await readFile(file, 'utf8')) as {
        chainId: number; complete: boolean; missingBlocks: string; completeThroughBlock: number; builtAt: string; events: KeyEvent[]
      }
      if (saved.chainId !== chain.id || !saved.complete || saved.missingBlocks !== '0') throw new Error('Refusing an incomplete or wrong-chain import')
      shard = mergeEvents({}, saved.events)
      through = saved.completeThroughBlock
      source = { kind: 'import', importedThroughBlock: through, importedBuiltAt: saved.builtAt }
      console.log(`Imported ${saved.events.length} events from ${path.basename(file)}, complete through ${through}`)
    } catch (importError) {
      if ((importError as NodeJS.ErrnoException).code !== 'ENOENT') throw importError
      console.log('No saved index found. Scanning from block 0.')
    }
  }
  const client = readClient(name)
  if (await client.getChainId() !== chain.id) throw new Error('RPC chain ID mismatch')
  const latest = Number(await client.getBlockNumber())
  if (latest < through) throw new Error('RPC is behind the existing index')
  const scan = await collect(fetchKeyLogs(client), BigInt(through + 1), BigInt(latest), 15 * 60_000)
  console.log(JSON.stringify({ fromBlock: through + 1, toBlock: latest, ...scan, events: scan.events.length }))
  if (!scan.complete) throw new Error(`Partial scan. Existing shards were not changed. Missing ranges: ${JSON.stringify(scan.missingRanges)}`)
  shard = mergeEvents(shard, scan.events)
  const parts: Record<string, Shard> = Object.fromEntries(shardNames.map((prefix) => [prefix, {}]))
  const counts = { accounts: Object.keys(shard).length, keys: 0, adminKeys: 0, revokedKeys: 0 }
  for (const [account, keys] of Object.entries(shard)) {
    parts[account.slice(2, 4)]![account] = keys
    for (const key of keys) { counts.keys++; if (key[2] & 1) counts.adminKeys++; if (key[2] & 2) counts.revokedKeys++ }
  }
  await mkdir(directory, { recursive: true })
  for (const prefix of shardNames) {
    const file = path.join(directory, `${prefix}.json`)
    await writeFile(`${file}.tmp`, JSON.stringify(parts[prefix]))
    await rename(`${file}.tmp`, file)
  }
  // Publish metadata last, after every shard. Don't build into a running
  // server's directory; deploy the completed snapshot with the application.
  const nextMeta: IndexMeta = { chainId: chain.id, complete: true, completeThroughBlock: latest,
    builtAt: new Date().toISOString(), counts, source }
  await writeFile(path.join(directory, 'meta.json.tmp'), JSON.stringify(nextMeta, null, 2) + '\n')
  await rename(path.join(directory, 'meta.json.tmp'), path.join(directory, 'meta.json'))
  console.log(`PASS ${chain.name}: blocks 0–${latest}, ${counts.keys} keys, ${counts.accounts} accounts, 256 shards`)
}

main().catch((error) => { console.error(`FAIL index build: ${error.message}`); process.exitCode = 1 })
