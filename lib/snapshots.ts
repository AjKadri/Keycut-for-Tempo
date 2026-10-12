import { readFile } from 'node:fs/promises'
import type { IndexMeta } from './index'
export async function snapshots() {
  return Promise.all([42431, 4217].map(async id => { try { return JSON.parse(await readFile(`public/index/${id}/meta.json`, 'utf8')) as IndexMeta } catch { return null } }))
}
export const snapshotDate = (meta: IndexMeta | null) => meta ? new Date(meta.builtAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'an unavailable date'
export function snapshotMarkup(html: string, metas: (IndexMeta | null)[]) {
  const [test, main] = metas
  const num = (value: number) => value.toLocaleString('en-GB')
  const percent = (meta: IndexMeta) => (meta.counts.revokedKeys / meta.counts.keys * 100).toFixed(1)
  const bold = (value: number | string, suffix = '', hot = false) => `<b${hot ? ' class="hot"' : ''} data-to="${value}"${suffix ? ` data-suffix="${suffix}"` : ''}>${typeof value === 'number' ? num(value) : value}${suffix}</b>`
  const stats = test ? `On Tempo testnet, ${bold(test.counts.accounts)} accounts hold ${bold(test.counts.keys)} access keys. ${bold(percent(test), '%', true)} of them were ever revoked.` : 'Testnet snapshot unavailable.'
  const detail = main ? `On mainnet, ${num(main.counts.accounts)} accounts hold ${num(main.counts.keys)} keys and ${percent(main)}% were ever revoked. Counted from the chain’s key events on ${snapshotDate(main)}, through block ${num(main.completeThroughBlock)}${test ? ` on mainnet and ${num(test.completeThroughBlock)} on testnet` : ''}.` : 'Mainnet snapshot unavailable.'
  return html.replace('{{STATS}}', stats).replace('{{DETAIL}}', detail)
}
