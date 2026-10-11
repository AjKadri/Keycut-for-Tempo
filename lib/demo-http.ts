import { isAddress, type Address } from 'viem'
import { isIP } from 'node:net'
import { openSession, type DemoSession } from './demo-session'

const creations = new Map<string, { count: number; until: number }>()
export class DemoRequestError extends Error {
  constructor(message: string, public status = 400, public retryAfter?: number) { super(message) }
}
export async function demoBody(request: Request, action: 'create' | 'pay' | 'revoke') {
  if (request.headers.get('origin') !== (process.env.KEYCUT_DEMO_ORIGIN ?? new URL(request.url).origin)) throw new DemoRequestError('Open the demo on this site to run it.', 403)
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new DemoRequestError('Send a JSON demo request.')
  const text = await request.text()
  if (text.length > 4096) throw new DemoRequestError('Demo request is too large.')
  let body: Record<string, unknown>
  try { body = JSON.parse(text) } catch { throw new DemoRequestError('Send a valid JSON demo request.') }
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.chainId !== 42431) throw new DemoRequestError('Demo routes only allow test network 42431.')
  const allowed = action === 'create' ? ['chainId'] : action === 'revoke' ? ['chainId', 'session', 'keyId'] : ['chainId', 'session']
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new DemoRequestError('Demo routes accept only the testnet chain ID and an issued demo session. Do not send keys.')
  if (action === 'create') {
    const forwarded = request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()
    const ip = forwarded && isIP(forwarded) ? forwarded : 'local'
    const now = Date.now()
    for (const [key, bucket] of creations) if (bucket.until <= now) creations.delete(key)
    let bucket = creations.get(ip)
    if (!bucket) { bucket = { count: 0, until: now + 3600_000 }; creations.set(ip, bucket) }
    if (bucket.count >= 5) throw new DemoRequestError('Too many demos. You can create 5 per hour. Please try again later or view the leftover example.', 429, Math.ceil((bucket.until - now) / 1000))
    bucket.count++
    return undefined
  }
  if (typeof body.session !== 'string') throw new DemoRequestError('An issued demo session is required.')
  let session: DemoSession
  try { session = openSession(body.session) } catch (error) { throw new DemoRequestError((error as Error).message) }
  const keyId = action === 'revoke' ? body.keyId ?? session.childId : undefined
  if (keyId !== undefined && (typeof keyId !== 'string' || !isAddress(keyId, { strict: false }) || !(session.keyIds ?? [session.childId]).some(key => key.toLowerCase() === keyId.toLowerCase()))) throw new DemoRequestError('Choose a key issued by this demo account.')
  if (action === 'pay' ? !['leftover', 'revoked'].includes(session.phase) : keyId?.toLowerCase() === session.childId.toLowerCase() && session.phase !== 'paid') throw new DemoRequestError('Complete the demo steps in order.')
  return { session, keyId: keyId as Address | undefined }
}
export function demoError(error: unknown) {
  const known = error instanceof DemoRequestError
  return Response.json({ error: known ? error.message : 'This demo action could not be confirmed. Check the account before trying again. The leftover example is still available.' }, {
    status: known ? error.status : 503,
    headers: { 'Cache-Control': 'no-store', ...(known && error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {}) },
  })
}
