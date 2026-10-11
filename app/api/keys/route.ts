import { isAddress } from 'viem'
import { cachedLookup } from '../../../lib/lookup'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const chain = params.get('chain'), address = params.get('address')
  const pageText = params.get('page') ?? '1', page = Number(pageText)
  const headers = { 'Cache-Control': 'no-store' }
  if ((chain !== 'testnet' && chain !== 'mainnet') || !address || !isAddress(address, { strict: false }) ||
    !/^\d+$/.test(pageText) || !Number.isSafeInteger(page) || page < 1) {
    return Response.json({ error: 'Use chain=testnet|mainnet, a valid account address, and page=1 or higher.' }, { status: 400, headers })
  }
  try {
    return Response.json(await cachedLookup(chain, address, page), { headers })
  } catch {
    return Response.json({ complete: false, error: "We couldn't load the index or reach this network. Try again." }, { status: 503, headers })
  }
}
