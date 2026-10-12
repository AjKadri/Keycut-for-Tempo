import { BaseError } from 'viem'
import { bankClient, createScenario, type DemoEvent } from '../../../../lib/demo'
import { sealSession } from '../../../../lib/demo-session'
import { demoBody, demoError, DemoRequestError } from '../../../../lib/demo-http'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  try {
    await demoBody(request, 'create')
    // Check configuration before funding any account.
    bankClient()
    if (!process.env.KEYCUT_DEMO_SECRET || process.env.KEYCUT_DEMO_SECRET.length < 32) throw new DemoRequestError('Demo unavailable. Server setup is incomplete.', 503)
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        let connected = true
        const emit = (event: DemoEvent) => { if (connected) { try { controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')) } catch { connected = false } } }
        try {
          const { session } = await createScenario(emit)
          emit({ type: 'ready', account: session.account, admin: session.admin, child: session.childId, vendor: session.vendor, session: sealSession(session) })
        } catch (error) {
          console.error('Demo setup failed:', error instanceof BaseError ? error.shortMessage : error instanceof Error ? error.message : 'Unknown setup error')
          const message = error instanceof Error && /bank|setup|Funding failed/.test(error.message) ? error.message : 'Demo setup could not be completed. You can still view the leftover example.'
          emit({ type: 'error', error: message })
        } finally { if (connected) controller.close() }
      },
    })
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } })
  } catch (error) { return demoError(error) }
}
