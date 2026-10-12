'use client'
import Link from 'next/link'
import { useState } from 'react'
export function KeyAction({ keyId, chain, permanent, onRevoke, disabled, disabledReason, walletMode, onConnectWallet }: {
  keyId: string; chain: string; permanent?: boolean; onRevoke?: (key: string) => void;
  disabled?: boolean; disabledReason?: string; walletMode?: 'owner' | 'other' | 'disconnected'; onConnectWallet?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const command = `await client.accessKey.revokeSync({ accessKey: '${keyId}' })`
  if (walletMode === 'owner' && onRevoke) return <div className="key-action"><button disabled={disabled} onClick={() => onRevoke(keyId)} className="btn btn-cut">Cut access</button>{disabledReason && <p className="subtext">{disabledReason}</p>}</div>
  if (walletMode === 'other') return <div className="key-action"><p className="subtext">Only this account's owner can revoke its keys.</p></div>
  if (walletMode === 'disconnected') return <div className="key-action"><button disabled={disabled} onClick={onConnectWallet} className="btn btn-line">Connect wallet to revoke</button></div>
  if (onRevoke) return <div className="key-action"><button disabled={disabled} onClick={() => onRevoke(keyId)} className="btn btn-cut">Cut access</button>{disabledReason && <p className="subtext">{disabledReason}</p>}</div>
  if (permanent) return <div className="key-action"><Link className="action-link" href="/demo">Cut access in a fresh demo</Link><p className="subtext">This permanent example has no saved signing keys. Use a fresh demo to cut access.</p></div>
  return <details className="key-action how-to-revoke"><summary>How to revoke</summary><p className="subtext">Run this with your account owner’s authenticated <code>viem/tempo</code> client on {chain === 'mainnet' ? 'mainnet (4217)' : 'testnet (42431)'}. This page doesn’t sign transactions.</p><pre>{command}</pre><button className="icon-btn" onClick={async () => { try { await navigator.clipboard.writeText(command); setCopied(true) } catch { setCopied(false) } }}>{copied ? 'Copied' : 'Copy command'}</button></details>
}
