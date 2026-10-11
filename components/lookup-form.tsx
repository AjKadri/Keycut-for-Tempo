'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { isAddress } from 'viem'

export function LookupForm() {
  const router = useRouter()
  const [error, setError] = useState('')
  return <form className="lookup-form" onSubmit={event => {
    event.preventDefault()
    const values = new FormData(event.currentTarget), address = String(values.get('address')).trim()
    if (!isAddress(address, { strict: false })) { setError('Enter a full Tempo account address beginning with 0x.'); return }
    setError(''); router.push(`/${values.get('chain')}/${address}`)
  }}>
    <label htmlFor="chain">Network</label><select id="chain" name="chain"><option value="testnet">Testnet · Moderato</option><option value="mainnet">Mainnet</option></select>
    <label htmlFor="address">Account address</label><input id="address" name="address" placeholder="0x…" required autoComplete="off" spellCheck={false} aria-describedby={error ? 'address-error' : undefined} />
    {error && <p id="address-error" role="alert">{error}</p>}
    <button type="submit">Find keys</button>
  </form>
}
