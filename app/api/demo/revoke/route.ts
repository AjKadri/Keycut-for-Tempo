import { revokeChild, withDemoLock } from '../../../../lib/demo'
import { demoBody, demoError } from '../../../../lib/demo-http'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    const { session, keyId } = (await demoBody(request, 'revoke'))!
    return Response.json(await withDemoLock(session.account, () => revokeChild(session, keyId)), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return demoError(error) }
}
