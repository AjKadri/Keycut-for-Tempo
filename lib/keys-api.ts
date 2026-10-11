import type { lookupKeys } from './lookup'

export type KeysResult = Awaited<ReturnType<typeof lookupKeys>>
export type KeyResult = KeysResult['keys'][number]

export async function fetchKeys(chain: string, address: string, page: number, signal: AbortSignal): Promise<KeysResult> {
  const response = await fetch(`/api/keys?${new URLSearchParams({ chain, address, page: String(page) })}`, { signal })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'The lookup failed. Try again.')
  return data
}
