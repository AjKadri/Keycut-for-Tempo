// Small DOM effects shared by the seeded illustrations and the real transaction UI.
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
export const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, reducedMotion() ? 0 : ms))
export async function cut(el: HTMLElement) {
  if (reducedMotion()) return
  // Overlays leave React's element tree intact while its two halves separate.
  const box = el.getBoundingClientRect(), holder = document.createElement('div')
  Object.assign(holder.style, { position: 'fixed', left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, zIndex: '55', pointerEvents: 'none' })
  const left = el.cloneNode(true) as HTMLElement, right = el.cloneNode(true) as HTMLElement
  for (const [node, polygon] of [[left, '0 0,57% 0,49% 100%,0 100%'], [right, '58% 0,100% 0,100% 100%,50% 100%']] as const) {
    node.removeAttribute('id'); node.querySelectorAll('[id]').forEach(child => child.removeAttribute('id'))
    node.setAttribute('aria-hidden', 'true'); node.inert = true
    Object.assign(node.style, { position: 'absolute', inset: '0', margin: '0', width: '100%', height: '100%', animation: 'none', clipPath: `polygon(${polygon})` })
    holder.append(node)
  }
  const blade = document.createElement('div'); blade.className = 'blade'
  const angle = Math.atan2(.08 * box.width, box.height) * 180 / Math.PI
  Object.assign(blade.style, { left: `${.5844 * box.width}px`, top: `${-.18 * box.height}px`, height: `${box.height * 1.36}px` })
  holder.append(blade); document.body.append(holder)
  const visibility = el.style.visibility; el.style.visibility = 'hidden'
  try {
    blade.animate([{ transform: `rotate(${angle}deg) scaleY(0)`, opacity: 1 }, { transform: `rotate(${angle}deg) scaleY(1)`, opacity: 1, offset: .7 }, { transform: `rotate(${angle}deg) scaleY(1)`, opacity: 0 }], { duration: 520, fill: 'forwards' })
    await right.animate([{ transform: 'none', opacity: 1 }, { transform: 'translate(10px,28px) rotate(5deg)', opacity: 0 }], { duration: 700, delay: 420, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }).finished
  } finally { holder.remove(); el.style.visibility = visibility }
}
export async function swapText(el: HTMLElement, text: string) {
  if (reducedMotion() || el.textContent === text) { el.textContent = text; return }
  await el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px)' }], { duration: 220 }).finished
  el.textContent = text
  await el.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 320 }).finished
}
export function countUp(el: HTMLElement, duration = 1400) {
  const raw = el.dataset.to ?? '0', target = Number(raw), decimals = raw.split('.')[1]?.length ?? 0
  const paint = (value: number) => { el.textContent = value.toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + (el.dataset.suffix ?? '') }
  if (reducedMotion()) { paint(target); return () => {} }
  let frame = 0; const start = performance.now()
  const tick = (now: number) => { const p = Math.min(1, (now - start) / duration); paint(target * (1 - (1 - p) ** 4)); if (p < 1) frame = requestAnimationFrame(tick) }
  frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame)
}
export function onVisible(el: HTMLElement | null, fn: (el: HTMLElement) => void, threshold = .35) {
  if (!el) return () => {}
  if (reducedMotion()) { fn(el); return () => {} }
  const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); fn(el) } }, { threshold })
  observer.observe(el); return () => observer.disconnect()
}
export async function type(el: HTMLElement, text: string, speed = 22) {
  if (reducedMotion()) { el.textContent = text; return }
  for (let i = 1; i <= text.length && el.isConnected; i++) { el.textContent = text.slice(0, i); await wait(speed) }
}
export function toast(message: string) {
  const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = message
  document.body.append(el); requestAnimationFrame(() => el.classList.add('show'))
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), reducedMotion() ? 0 : 400) }, 3800)
}
export async function paymentMotion(board: HTMLElement, child: HTMLElement, shop: HTMLElement, accepted: boolean) {
  if (reducedMotion()) return
  const b = board.getBoundingClientRect(), c = child.getBoundingClientRect(), s = shop.getBoundingClientRect()
  const y = c.top - b.top + c.height / 2 - 9, x0 = c.right - b.left - 14, x1 = s.left - b.left + 12
  const coin = document.createElement('div'); coin.className = 'coin'; coin.textContent = '$'; coin.style.left = '0'; coin.style.top = '0'; board.append(coin)
  const wall = document.createElement('div'); wall.className = 'wall'
  try {
    if (accepted) {
      await coin.animate([{ transform: `translate(${x0}px,${y}px) scale(.6)` }, { transform: `translate(${(x0+x1)/2}px,${y-26}px)` }, { transform: `translate(${x1}px,${y}px) scale(.2)`, opacity: 0 }], { duration: 1100, fill: 'forwards' }).finished
      shop.animate([{ boxShadow: '0 0 0 0 #9fe3d6' }, { boxShadow: '0 0 0 14px transparent' }], { duration: 700 })
    } else {
      const x = (x0+x1)/2+8; Object.assign(wall.style, { left: `${x}px`, top: `${y-22}px`, height: '62px' }); board.append(wall)
      wall.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: 260 })
      await coin.animate([{ transform: `translate(${x0}px,${y}px)` }, { transform: `translate(${x-20}px,${y}px)` }], { duration: 650, fill: 'forwards' }).finished
      coin.style.background = 'var(--coral)'
      await coin.animate([{ transform: `translate(${x-20}px,${y}px)` }, { transform: `translate(${x-44}px,${y+34}px) scale(.5)`, opacity: 0 }], { duration: 600, fill: 'forwards' }).finished
    }
  } finally { coin.remove(); wall.remove() }
}
