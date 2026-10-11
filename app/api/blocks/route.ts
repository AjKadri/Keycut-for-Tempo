import { tempo, tempoModerato } from 'viem/chains'
import { createClient } from 'viem/tempo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const results = await Promise.all([tempoModerato, tempo].map(async (chain) => {
    try {
      const client = createClient({ chain })
      const [chainId, block] = await Promise.all([client.getChainId(), client.getBlockNumber()])
      if (chainId !== chain.id) throw new Error('Unexpected chain')
      return { chainId, network: chain.name, latestBlock: block.toString(), ok: true }
    } catch {
      return { chainId: chain.id, network: chain.name, latestBlock: null, ok: false,
        error: 'The host could not read this network. Try again.' }
    }
  }))
  const ok = results.every((result) => result.ok)
  return Response.json({ ok, checkedAt: new Date().toISOString(), networks: results }, {
    status: ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
