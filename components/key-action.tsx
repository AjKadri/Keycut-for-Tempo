'use client'
import Link from 'next/link'
import { useState } from 'react'
export function KeyAction({ keyId, chain, permanent, onRevoke, disabled, disabledReason }: {
  keyId: string; chain: string; permanent?: boolean; onRevoke?: (key: string) => void;
  disabled?: boolean; disabledReason?: string
}) {
  const [copied, setCopied] = useState(false)
  const command = `await client.accessKey.revokeSync({ accessKey: '${keyId}' })`
  if (onRevoke) return <div className="key-action"><button disabled={disabled} onClick={() => onRevoke(keyId)}>Revoke key</button>{disabledReason && <p className="subtext">{disabledReason}</p>}</div>
  if (permanent) return <div className="key-action"><Link className="action-link" href="/demo">Revoke in a fresh demo</Link><p className="subtext">This permanent example has no saved signing keys. Use a fresh demo to try revocation.</p></div>
  return <details className="key-action how-to-revoke"><summary>How to revoke</summary><p className="subtext">Run this with your account owner’s authenticated <code>viem/tempo</code> client on {chain === 'mainnet' ? 'mainnet (4217)' : 'testnet (42431)'}. This page doesn’t sign transactions.</p><pre>{command}</pre><button onClick={async () => { try { await navigator.clipboard.writeText(command); setCopied(true) } catch { setCopied(false) } }}>{copied ? 'Copied' : 'Copy command'}</button></details>
}
