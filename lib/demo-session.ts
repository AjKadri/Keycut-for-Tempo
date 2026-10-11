import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'
import type { Address, Hex } from 'viem'

export type DemoSession = {
  chainId: 42431; root: Hex; child: Hex; account: Address; admin: Address; childId: Address;
  vendor: Address; keyIds?: Address[]; expires: number; phase: 'leftover' | 'paid' | 'revoked' | 'finished'
}
function secret() {
  const value = process.env.KEYCUT_DEMO_SECRET
  if (!value || value.length < 32) throw new Error('Demo unavailable. Server setup is incomplete.')
  return createHash('sha256').update(value).digest()
}
export function sealSession(session: DemoSession) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', secret(), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(session)), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url')
}
export function openSession(token: string): DemoSession {
  try {
    const bytes = Buffer.from(token, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', secret(), bytes.subarray(0, 12))
    decipher.setAuthTag(bytes.subarray(12, 28))
    const session = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString()) as DemoSession
    if (session.chainId !== 42431 || session.expires <= Date.now()) throw new Error()
    return session
  } catch { throw new Error('This demo session is invalid or expired. Start a fresh demo.') }
}
