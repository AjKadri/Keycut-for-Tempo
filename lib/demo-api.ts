import type { DemoEvent } from './demo'
export type DemoReady = Extract<DemoEvent, { type: 'ready' }>
export type ActionResult = { session: string; hash: string | null; url: string | null; explanation: string; submission?: string; vendorReceived?: string; before?: string; after?: string; outcome?: string }
export async function createDemo(onEvent: (event: DemoEvent) => void) {
  const response = await fetch('/api/demo/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chainId: 42431 }) })
  if (!response.ok) throw new Error((await response.json()).error)
  const reader = response.body!.getReader(), decoder = new TextDecoder()
  let pending = '', ready = false
  while (true) {
    const { value, done } = await reader.read()
    pending += decoder.decode(value, { stream: !done })
    const lines = pending.split('\n'); pending = lines.pop()!
    for (const line of lines) {
      if (!line) continue
      const event = JSON.parse(line) as DemoEvent
      if (event.type === 'error') throw new Error(event.error)
      if (event.type === 'ready') ready = true
      onEvent(event)
    }
    if (done) break
  }
  if (!ready) throw new Error('Demo setup was interrupted. The leftover example is still available.')
}
export async function demoAction(action: 'pay' | 'revoke', session: string): Promise<ActionResult> {
  const response = await fetch(`/api/demo/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chainId: 42431, session }) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error)
  return result
}
