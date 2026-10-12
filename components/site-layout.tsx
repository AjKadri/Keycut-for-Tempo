'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useId, useRef, useState } from 'react'
import example from '../lib/leftover-example.json'
export const NetworkContext = createContext({ chain: 'testnet', setChain: (_chain: string) => {} })
export const useNetwork = () => useContext(NetworkContext)
export function Logo() {
  const id = useId().replaceAll(':', '')
  return <svg className="mark" viewBox="0 0 64 64" aria-hidden="true"><defs><clipPath id={`l${id}`}><polygon points="0,0 40,0 34,64 0,64" /></clipPath><clipPath id={`r${id}`}><polygon points="45.5,0 64,0 64,64 39.5,64" /></clipPath></defs><rect width="64" height="64" rx="16" fill="#0F766E" /><g fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round"><g clipPath={`url(#l${id})`}><circle cx="18" cy="31" r="9" /><path d="M27 31H44" /></g><g className="rpiece" clipPath={`url(#r${id})`}><g transform="translate(2 5) rotate(5 42 31)"><path d="M32 31H54M47 31v8M53 31v6" /></g></g></g><path d="M43.6 15 38.4 49" stroke="#FF6B4A" strokeWidth="3.2" strokeLinecap="round" /></svg>
}
const links = [['/#check','Check an account'],['/demo','Live demo'],['/learn','What are access keys?'],['/#how','How it works'],['https://github.com/AjKadri/Keycut-for-Tempo','GitHub']] as const
export function SiteLayout({ children, snapshotDate }: { children: React.ReactNode; snapshotDate: string }) {
  const path = usePathname(), router = useRouter(), [chosen, setChosen] = useState('testnet'), [open, setOpen] = useState(false)
  const chain = path.startsWith('/mainnet/') ? 'mainnet' : path.startsWith('/testnet/') || path === '/demo' || path === '/wallet-test' ? 'testnet' : chosen
  const net = useRef<HTMLDivElement>(null), drawer = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const place = () => { const button = net.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]'), pill = net.current?.querySelector<HTMLElement>('.pill'); if (button && pill) { pill.style.width = `${button.offsetWidth}px`; pill.style.transform = `translateX(${button.offsetLeft - 3}px)` } }
    place(); document.fonts.ready.then(place); window.addEventListener('resize', place); return () => window.removeEventListener('resize', place)
  }, [chain])
  useEffect(() => { if (open) drawer.current?.showModal(); else drawer.current?.close() }, [open])
  function setChain(value: string) { setChosen(value); const parts = path.split('/'); if (parts[1] === 'testnet' || parts[1] === 'mainnet') router.push(`/${value}/${parts[2]}`); else if (path === '/demo' || path === '/wallet-test') router.push('/#check') }
  const nav = links.map(([href, title]) => <Link key={href} href={href} aria-current={path === href ? 'page' : undefined} onClick={() => setOpen(false)}>{title}</Link>)
  return <NetworkContext.Provider value={{ chain, setChain }}><header className="wrap top"><Link className="brand" href="/" aria-label="Keycut home"><Logo /><span className="word">Keycut</span></Link><nav className="nav" aria-label="Main">{nav}</nav><div className="net" ref={net} role="group" aria-label="Network"><span className="pill" aria-hidden="true" />{['testnet','mainnet'].map(value => <button key={value} aria-pressed={chain === value} onClick={() => setChain(value)}>{value === 'testnet' ? 'Testnet' : 'Mainnet'}</button>)}</div><button className="menu-btn" aria-expanded={open} aria-controls="phone-menu" onClick={() => setOpen(true)}>Menu</button></header><dialog ref={drawer} id="phone-menu" className="phone-menu" aria-label="Menu" onCancel={() => setOpen(false)} onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}><div className="drawer-panel"><div className="row-x"><Link className="brand" href="/" onClick={() => setOpen(false)}><Logo /><span>Keycut</span></Link><button className="menu-btn" onClick={() => setOpen(false)}>Close</button></div><nav>{nav}</nav></div></dialog>{children}<footer><div className="wrap"><div className="foot"><div><Link className="brand" href="/"><Logo /><span>Keycut</span></Link><p>See who can spend from a Tempo account. Cut the access you don't want.</p></div><div><h4>Product</h4><ul><li><Link href="/#check">Check an account</Link></li><li><Link href="/demo">Live demo</Link></li><li><Link href={`/testnet/${example.account}`}>A leftover key</Link></li></ul></div><div><h4>Learn</h4><ul><li><Link href="/learn">What are access keys?</Link></li><li><Link href="/#questions">Questions</Link></li><li><a href="https://github.com/AjKadri/Keycut-for-Tempo#verify-it-yourself">Verify it yourself</a></li></ul></div><div><h4>Code</h4><ul><li><a href="https://github.com/AjKadri/Keycut-for-Tempo">GitHub</a></li><li><a href="https://github.com/AjKadri/Keycut-for-Tempo/blob/main/LICENSE">MIT licence</a></li></ul></div></div><div className="legal"><span>Key counts from the snapshot of {snapshotDate}.</span><span>Built on Tempo.</span></div></div></footer></NetworkContext.Provider>
}
