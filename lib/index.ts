export type KeyEvent = { block: number; kind: 'authorized' | 'admin' | 'revoked'; account: string; key: string }
export type KeyEntry = [key: string, firstSeenBlock: number, flags: number]
export type Shard = Record<string, KeyEntry[]>
export type BlockRange = [from: number, to: number]

// Revocation is permanent. Repeated/out-of-order events can't undo flags.
export function mergeEvents(shard: Shard, events: KeyEvent[]): Shard {
  const accounts = new Map<string, Map<string, KeyEntry>>()
  for (const [account, entries] of Object.entries(shard)) {
    accounts.set(account.toLowerCase(), new Map(entries.map(([key, block, flags]) =>
      [key.toLowerCase(), [key.toLowerCase(), block, flags]])))
  }
  for (const event of events) {
    const account = event.account.toLowerCase(), key = event.key.toLowerCase()
    const keys = accounts.get(account) ?? new Map<string, KeyEntry>()
    const prior = keys.get(key) ?? [key, event.block, 0]
    keys.set(key, [key, Math.min(prior[1], event.block), prior[2] |
      (event.kind === 'admin' ? 1 : event.kind === 'revoked' ? 2 : 0)])
    accounts.set(account, keys)
  }
  return Object.fromEntries([...accounts].sort(([a], [b]) => a.localeCompare(b)).map(([account, keys]) =>
    [account, [...keys.values()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))]))
}

export function mergeRanges(ranges: BlockRange[]): BlockRange[] {
  const merged: BlockRange[] = []
  for (const [from, to] of [...ranges].sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1)
    if (last && from <= last[1] + 1) last[1] = Math.max(last[1], to)
    else merged.push([from, to])
  }
  return merged
}

export type IndexMeta = {
  chainId: number; complete: true; completeThroughBlock: number; builtAt: string
  counts: { accounts: number; keys: number; adminKeys: number; revokedKeys: number }
  source: { kind: 'import' | 'scan'; importedThroughBlock?: number; importedBuiltAt?: string }
}
