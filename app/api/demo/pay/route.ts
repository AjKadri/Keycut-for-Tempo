import { payChild, withDemoLock } from '../../../../lib/demo'
import { demoBody, demoError } from '../../../../lib/demo-http'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    const session = (await demoBody(request, 'pay'))!
    return Response.json(await withDemoLock(session.account, () => payChild(session)), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return demoError(error) }
}
