import { Abis } from 'viem/tempo'
import { bankClient, ALPHA } from '../../../lib/demo'
import { demoCapacity } from '../../../lib/demo-capacity'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    const bank = bankClient()
    if (await bank.getChainId() !== 42431) throw new Error('Unexpected network')
    const balance = await bank.readContract({ address: ALPHA, abi: Abis.tip20, functionName: 'balanceOf', args: [bank.account.address] })
    return Response.json({ ok: true, chainId: 42431, checkedAt: new Date().toISOString(), remainingDemos: demoCapacity(balance),
      fundingPerDemo: '10 test AlphaUSD', feeBudgetPerDemo: '1 test AlphaUSD', note: 'Conservative funding capacity. Test network only, not real funds.' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ ok: false, remainingDemos: null, error: 'Demo bank capacity is unavailable. Try again later.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
