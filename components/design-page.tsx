'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { isAddress } from 'viem'
import { cut, swapText, countUp, onVisible, type, wait, reducedMotion, toast, reveal } from '../lib/motion'
import { keySummary } from '../lib/key-summary'
import { fetchKeys } from '../lib/keys-api'
import example from '../lib/leftover-example.json'
import { useNetwork } from './site-layout'
export function DesignPage({ html, page }: { html: string; page: 'home' | 'learn' | '404' }) {
  const root = useRef<HTMLDivElement>(null), network = useNetwork(), router = useRouter()
  // The fixed editorial markup is derived from the supplied design. All data is
  // supplied by metadata or the product API. No chain responses live in this markup.
  useEffect(() => {
    const container = root.current!, controller = new AbortController(), cleanups: (() => void)[] = []
    const q = <T extends HTMLElement = HTMLElement>(selector: string) => container.querySelector<T>(selector)
    for (const form of container.querySelectorAll<HTMLFormElement>('form.search')) {
      const handler = (event: SubmitEvent) => {
        event.preventDefault(); const input = form.querySelector('input')!, address = input.value.trim()
        const msg = q('#searchmsg')
        if (!isAddress(address, { strict: false })) { if (msg) { msg.textContent = address ? "That isn't a Tempo address. It starts with 0x and has 42 characters." : 'Paste an account address first.'; msg.classList.add('err') } else toast('Enter a full Tempo account address beginning with 0x.'); form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); input.setAttribute('aria-invalid', 'true'); input.focus(); return }
        input.removeAttribute('aria-invalid'); router.push(`/${network.chain}/${address}`)
      }
      form.addEventListener('submit', handler); cleanups.push(() => form.removeEventListener('submit', handler))
    }
    cleanups.push(onVisible(q('.hero'), el => reveal(el, 'h1 span,.lede,.search,.fine,.alts')))
    const numbers = q<HTMLElement>('.numbers') ?? q<HTMLElement>('#count')
    cleanups.push(onVisible(numbers, section => section.querySelectorAll<HTMLElement>('[data-to]').forEach(node => cleanups.push(countUp(node)))))
    cleanups.push(onVisible(q('#steps'), el => el.classList.add('on'), .5))
    cleanups.push(onVisible(q('#frag1'), () => { const typed = q('#typed'); if (typed) void type(typed, `${example.account.slice(0,12)}…${example.account.slice(-6)}`,55) }))
    cleanups.push(onVisible(q('#frag2'), el => reveal(el, '.kv span')))
    cleanups.push(onVisible(q('#frag3'), async () => { const mini=q('#mini'); if (mini) { await wait(900); if (controller.signal.aborted) return; await cut(mini,{signal:controller.signal}); const badge=q('#minibadge'); if (badge) { badge.className='badge';badge.textContent='Revoked' } } }))
    cleanups.push(onVisible(q('#anat'), el => reveal(el, '.r')))
    if (page === 'learn') {
      const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('#toc a')), mark=q('#tocmark')
      const setOn=(link: HTMLAnchorElement) => { links.forEach(l=>l.classList.toggle('on',l===link)); if(mark){mark.style.height=`${link.parentElement!.offsetHeight}px`;mark.style.transform=`translateY(${link.parentElement!.offsetTop}px)`} }
      if(links.length) setOn(links[0]!)
      const observer=typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){const link=links.find(l=>l.hash===`#${entry.target.id}`);if(link)setOn(link)}}),{rootMargin:'-30% 0px -60% 0px'})
      container.querySelectorAll('article section').forEach(s=>observer?.observe(s));cleanups.push(()=>observer?.disconnect())
      const handler=async(event: MouseEvent)=>{
        const button=(event.target as Element).closest<HTMLButtonElement>('.flip button')
        if(button){container.querySelectorAll('.flip button').forEach(b=>b.setAttribute('aria-pressed',String(b===button))); for(const el of container.querySelectorAll<HTMLElement>('#anat .ex')){el.classList.toggle('bad',button.dataset.k==='b');void swapText(el,el.dataset[button.dataset.k!]!)} }
        if((event.target as Element).closest('#tgo')){const go=q<HTMLButtonElement>('#tgo')!;go.disabled=true;await cut(q('#tAdmin')!,{signal:controller.signal});if(controller.signal.aborted)return;q('#tAdmin')!.classList.add('dead');q('#tAdminS')!.textContent='Revoked';q('#tw2')!.classList.add('broken');q('#tChild')!.classList.add('hot');q('#tsay')!.className='say alarm';await swapText(q('#tsay')!,'Admin key revoked. The child key is still active and can still spend.');go.hidden=true;q('#treset')!.hidden=false}
        if((event.target as Element).closest('#treset')){q('#tAdmin')!.classList.remove('dead');q('#tAdminS')!.textContent='Active';q('#tw2')!.classList.remove('broken');q('#tChild')!.classList.remove('hot');q('#tsay')!.className='say';void swapText(q('#tsay')!,'The agent holds the admin key. It made the child key.');const go=q<HTMLButtonElement>('#tgo')!;go.hidden=false;go.disabled=false;q('#treset')!.hidden=true}
      }
      container.addEventListener('click',handler);cleanups.push(()=>container.removeEventListener('click',handler))
    }
    if (page === 'home') {
      let generation=0
      async function play() {
        const run=++generation, ledger=q('#ledger')!,rows=q('#rows')!,found=q('#found')!,verdict=q('#verdict')!
        ledger.classList.add('scanning')
        found.textContent='Reading keys…'
        verdict.textContent='\u00a0'
        rows.replaceChildren()
        try {
          const data=await fetchKeys('testnet',example.account,1,controller.signal)
          if(controller.signal.aborted||run!==generation)return
          rows.replaceChildren()
          for(const entry of data.keys){
            const row=document.createElement('div');row.className=`row found ${entry.status==='active'?'':'dim'}`
            const id=document.createElement('span');id.className='id';id.textContent=`${entry.key.toLowerCase()===example.child.toLowerCase()?'Child key':entry.key.toLowerCase()===example.admin.toLowerCase()?'Admin key':'Key'} ${entry.key.slice(0,8)}…${entry.key.slice(-4)}`
            const state=document.createElement('span');state.className='state';state.textContent=entry.status.charAt(0).toUpperCase()+entry.status.slice(1)
            const what=document.createElement('span');what.className='what';what.textContent=entry.raw?keySummary(entry.raw,data.permissionsAtTimestamp):entry.sentence
            row.append(id,state,what)
            if(entry.raw){const details=document.createElement('details');details.className='row-details';const summary=document.createElement('summary');summary.textContent='Permission details';const pre=document.createElement('pre');pre.textContent=JSON.stringify(entry.raw,null,2);details.append(summary,pre);row.append(details)}
            if(entry.key.toLowerCase()===example.child.toLowerCase()){row.classList.add('target');const note=document.createElement('span');note.className='note';note.textContent='Left behind by a revoked admin key. Known from this seeded setup.';row.append(note)}
            rows.append(row);cleanups.push(onVisible(row, el=>reveal(el,'.id,.state,.what')));found.textContent=`${rows.children.length} of ${data.totalKeys} found`;await wait(420);if(controller.signal.aborted||run!==generation)return
          }
          ledger.classList.remove('scanning');found.textContent=`${data.totalKeys} keys found`
          const activeCount=data.keys.filter(k=>k.status==='active').length
          await swapText(verdict,`${activeCount} key${activeCount===1?'':'s'} can still spend from this account.`)
          await wait(1500);if(controller.signal.aborted||run!==generation)return;const target=q('.row.target');if(target){await cut(target,{signal:controller.signal});await swapText(verdict,'No key can spend from this account.');const note=target.querySelector<HTMLElement>('.note');if(note)note.textContent='Cut animation only. This permanent example stays active.'}
        } catch(error){if(!controller.signal.aborted){ledger.classList.remove('scanning');found.textContent='Lookup unavailable';verdict.textContent='\u00a0';if(!rows.children.length)rows.textContent=(error as Error).message}}
      }
      const replay=q('#replay')!;replay.addEventListener('click',play);cleanups.push(()=>replay.removeEventListener('click',play));void play()
    }
    return ()=>{controller.abort();cleanups.forEach(fn=>fn())}
  },[page,router,network.chain])
  return <div ref={root} className={page==='home'?'home-design':undefined} dangerouslySetInnerHTML={{__html:html}} />
}
