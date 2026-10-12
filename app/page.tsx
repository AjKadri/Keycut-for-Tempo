import template from '../lib/design/index.json'
import { snapshots, snapshotMarkup } from '../lib/snapshots'
import { DesignPage } from '../components/design-page'
import { cachedLookup } from '../lib/lookup'
import { keySummary } from '../lib/key-summary'
import example from '../lib/leftover-example.json'
import type { Address } from 'viem'
export const dynamic = 'force-dynamic'
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))
export default async function Home() {
  let html = snapshotMarkup(template, await snapshots()).replace('id="typed"></span>', `id="typed">${example.account.slice(0,12)}…${example.account.slice(-6)}</span>`)
  try {
    const data = await cachedLookup('testnet', example.account as Address, 1)
    const rows = data.keys.map(entry => {
      const child = entry.key.toLowerCase() === example.child.toLowerCase()
      const kind = child ? 'Child key' : entry.key.toLowerCase() === example.admin.toLowerCase() ? 'Admin key' : 'Key'
      return `<div class="row ${child?'target':''} ${entry.status==='active'?'':'dim'}"><span class="id">${kind} ${entry.key.slice(0,8)}…${entry.key.slice(-4)}</span><span class="state">${entry.status.charAt(0).toUpperCase()+entry.status.slice(1)}</span><span class="what">${escape(entry.raw?keySummary(entry.raw,data.permissionsAtTimestamp):entry.sentence)}</span>${entry.raw?`<details class="row-details"><summary>Permission details</summary><pre>${escape(JSON.stringify(entry.raw,null,2))}</pre></details>`:''}${child?'<span class="note">Left behind by a revoked admin key. Known from this seeded setup.</span>':''}</div>`
    }).join('')
    html = html.replace('<div class="rows" id="rows"></div>', `<div class="rows" id="rows">${rows}</div>`).replace('id="found">Reading keys…', `id="found">${data.totalKeys} keys found`).replace('id="verdict">&nbsp;', `id="verdict">${data.keys.filter(key=>key.status==='active').length} key can still spend from this account.`)
  } catch {
    html = html.replace('id="verdict">&nbsp;', 'id="verdict">Open the seeded example').replace('<div class="rows" id="rows"></div>', `<div class="rows" id="rows"><a href="/testnet/${example.account}">Read this account’s current permissions</a></div>`)
  }
  return <DesignPage page="home" html={html} />
}
