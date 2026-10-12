'use client'
import { keySummary } from '../lib/key-summary'
import Link from 'next/link'
import { formatUnits } from 'viem'
import { useEffect, useRef, useState } from 'react'
import { createDemo, demoAction, type DemoReady, type ActionResult } from '../lib/demo-api'
import type { DemoEvent } from '../lib/demo'
import { fetchKeys, type KeysResult } from '../lib/keys-api'
import { cut, paymentMotion, toast, wait } from '../lib/motion'
import { AccountView } from './account-view'
import example from '../lib/leftover-example.json'
const short=(value:string)=>`${value.slice(0,6)}…${value.slice(-4)}`
const steps=[['Create a test account','A fresh account funded from the testnet bank.'],['Give an agent an admin key','The admin can create and revoke other keys.'],['The agent creates a child key','A 3 AlphaUSD cap, one vendor, a two-hour expiry.'],['Cut the admin’s access','The account revokes the admin key. Its child stays active.'],['The child key pays the vendor','It attempts 1 AlphaUSD. The vendor’s balance decides the outcome.'],['Cut the child key with Keycut','Revoke the child itself, then confirm its chain state.'],['The child key tries again','Same payment, same key. Check whether the vendor received anything.']]
const buttons=['Create a test account','','','','Pay with the child key','Cut access','Try to pay again']
type Transaction=Extract<DemoEvent,{type:'transaction'}>
const txStep=(tx:Transaction)=>tx.label.includes('Bank funded')?0:tx.label==='Created the admin key'?1:tx.label.startsWith('Admin created')?2:tx.label==='Revoked the admin key'?3:0
export function DemoView(){
  const [ready,setReady]=useState<DemoReady>(),[transactions,setTransactions]=useState<Transaction[]>([]),[results,setResults]=useState<Record<number,ActionResult>>({})
  const [at,setAt]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[version,setVersion]=useState(0),[keys,setKeys]=useState<KeysResult>()
  const [caption,setCaption]=useState('Press the first step to start.'),[auto,setAuto]=useState(false),[confirm,setConfirm]=useState(false)
  const board=useRef<HTMLDivElement>(null),admin=useRef<HTMLDivElement>(null),child=useRef<HTMLDivElement>(null),shop=useRef<HTMLDivElement>(null),dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{if(confirm)dialog.current?.showModal();else dialog.current?.close()},[confirm])
  useEffect(()=>{if(!ready)return;const controller=new AbortController();fetchKeys('testnet',ready.account,1,controller.signal).then(setKeys).catch(()=>{});return()=>controller.abort()},[ready,version])
  async function action(current:DemoReady,index:number){
    const result=await demoAction(index===5?'revoke':'pay',current.session)
    setResults(previous=>({...previous,[index]:result}))
    if(index===5&&child.current)await cut(child.current)
    if((index===4||index===6)&&board.current&&child.current&&shop.current&&result.vendorReceived!==undefined)await paymentMotion(board.current,child.current,shop.current,BigInt(result.vendorReceived)>0n)
    const next={...current,session:result.session};setReady(next);setAt(index+1);setVersion(value=>value+1);setCaption(result.explanation)
    if(index===5)toast(result.explanation)
    if(index===6)toast('Demo finished. Check the vendor’s balance and the live account view.')
    return next
  }
  async function run(all=false){
    if(busy)return;setBusy(true);setError('');setAuto(all)
    try{
      let current=ready,index=at
      if(!current){
        setTransactions([])
        await createDemo(event=>{if(event.type==='transaction')setTransactions(previous=>[...previous,event]);if(event.type==='ready')current=event})
        if(!current)throw new Error('The demo setup did not return an account.')
        setReady(current)
        // Setup returns the four confirmed outcomes together. Replay them in order.
        for(let i=1;i<=4;i++){setAt(i);setCaption(['','Account funded from the testnet bank.','The agent received an admin key.','The admin created the capped child key.','Admin key revoked. The child key is still active.'][i]!);if(i===4&&admin.current)await cut(admin.current);await wait(500)}
        setVersion(value=>value+1);index=4
        if(!all)return
      }
      if(index===5){setConfirm(true);return}
      current=await action(current,index)
      if(all&&index===4)setConfirm(true)
    }catch(error){setError((error as Error).message)}finally{setBusy(false)}
  }
  async function confirmCut(){setConfirm(false);setBusy(true);setError('');try{const current=await action(ready!,5);if(auto)await action(current,6)}catch(error){setError((error as Error).message)}finally{setBusy(false);setAuto(false)}}
  async function revokeFromCard(key:string){
    setBusy(true)
    try{const result=await demoAction('revoke',ready!.session,key);setReady(previous=>previous&&({...previous,session:result.session}));if(key.toLowerCase()===ready!.child.toLowerCase()){if(child.current)await cut(child.current);setResults(previous=>({...previous,5:result}));setAt(6);setCaption(result.explanation)}return result}finally{setBusy(false)}
  }
  const childEntry=keys?.keys.find(k=>k.key.toLowerCase()===ready?.child.toLowerCase())
  const childRaw=childEntry?.raw
  const limit=childRaw?.limits.find(token=>token.symbol==='AlphaUSD')
  const latestPayment=results[6]??results[4]
  const received=latestPayment?.after
  return <main className="wrap demo-page"><section className="demo-intro"><h1>Watch a key outlive its admin</h1><p>This runs on Tempo testnet with test money. Every step is a real transaction you can open on the explorer.</p></section><section className="demo"><div><ol className="plan"><span className="prog" aria-hidden="true" style={{transform:`scaleY(${Math.min(at,6)/6})`}} />{steps.map(([title,description],index)=><li key={title} className={`${index<at?'ok':''} ${at===index?'now':''} ${at===index&&busy?'run':''} ${index===4?'alarm':''}`}><span className="n">{index+1}</span><h3>{title}</h3><p>{results[index]?.explanation??description}</p><div className="tx">{transactions.filter(tx=>txStep(tx)===index).map(tx=><div key={tx.hash}><a href={tx.url} target="_blank" rel="noreferrer">{tx.label} · {short(tx.hash)}</a></div>)}{results[index]?.url&&<a href={results[index].url!} target="_blank" rel="noreferrer">Transaction {short(results[index].hash!)}</a>}{results[index]?.submission&&<p>{results[index].submission}</p>}{results[index]?.vendorReceived!==undefined&&<><p>Vendor balance: {formatUnits(BigInt(results[index].before!),6)} → {formatUnits(BigInt(results[index].after!),6)} AlphaUSD</p><details><summary>Base units</summary><p>6 decimals. Before: {results[index].before}. After: {results[index].after}. Change: {results[index].vendorReceived}.</p></details></>}</div></li>)}</ol><p className="fine demo-setup-note">The first four steps run together on a seeded testnet account, with two comparison keys. Payments use the vendor’s balance to confirm what happened. Test money has no value. <Link href={`/testnet/${example.account}`}>See a leftover key without setup</Link>.</p><div className="ctl">{at<7&&<><button className="btn btn-cut" disabled={busy} onClick={()=>run()}>{busy?<><span className="spin" />Waiting for the test network</>:buttons[at]||'Completing setup'}</button><button className="btn btn-line" disabled={busy} onClick={()=>run(true)}>Run {at?'remaining':'every'} step</button></>}{at>0&&<button className="btn btn-quiet" disabled={busy} onClick={()=>{setReady(undefined);setTransactions([]);setResults({});setAt(0);setKeys(undefined);setCaption('Press the first step to start.')}}>Start over</button>}</div>{error&&<div className="state-panel" role="alert"><h3>Couldn’t confirm this step</h3><p>{error}</p><Link href={`/testnet/${example.account}`}>See a leftover key</Link></div>}</div><div className="demo-live"><div className="stage" aria-label="What's on the account"><div className="stage-head"><span>Testnet · seeded demo</span><span className="mono">{ready?short(ready.account):'No account yet'}</span></div><div className="board" ref={board}><div className={`node ${at<1?'ghost':'pop'}`} id="nAcct"><div className="t">Your test account</div><div className="d">Funded from the testnet bank</div></div><div className={`wire ${at<2?'ghost':''}`} id="w1" /><div className={`node ${at<2?'ghost':at>=4?'dead':'pop'}`} id="nAdmin" ref={admin}><div className="t">Admin key <span className="state">{at>=4?'Revoked':'Active'}</span></div><div className="d">Held by the agent. Can create keys.</div></div><div className={`wire ${at<3?'ghost':at>=4?'broken':''}`} id="w2"><span className="lab">The child keeps its own access</span></div><div className={`node ${at<3?'ghost':at>=6?'dead':at>=4?'hot':'pop'}`} id="nChild" ref={child}><div className="t">Child key <span className="state">{at>=6?'Revoked':'Active'}</span></div><div className="d">{childRaw ? keySummary(childRaw, keys!.permissionsAtTimestamp) : "Can pay one vendor. Permissions appear after setup."}</div>{childRaw&&<details><summary>Permission details</summary><pre>{JSON.stringify(childRaw,null,2)}</pre></details>}{limit&&at<6&&<div className="meter"><div className="bar"><i style={{width:`${Math.min(100,Number(limit.remaining)/3_000_000*100)}%`}} /></div><div className="tt">{formatUnits(BigInt(limit.remaining),6)} AlphaUSD remaining</div></div>}</div><div className="node col2" id="nShop" ref={shop}><div className="t">Vendor</div><div className="d mono">{ready?short(ready.vendor):'Not created yet'}</div><div className="d">{received===undefined?'Balance not yet checked':`Balance ${formatUnits(BigInt(received),6)} AlphaUSD`}</div></div></div><p className={`caption ${at>=4&&at<6?'alarm':at>=6?'good':''}`} key={caption} aria-live="polite">{caption}</p><p className="stage-foot">Test AlphaUSD has no value. Lineage is known from this demo’s setup, not read from the chain. Other comparison keys remain in the actual account below.</p></div>{ready?<><Link className="demo-account-link" href={`/testnet/${ready.account}`} target="_blank">Open this account page</Link><AccountView key={ready.account} chain="testnet" address={ready.account} page={1} embedded refreshVersion={version} demo={{child:ready.child,childCanRevoke:at>=5,busy,onRevoke:revokeFromCard}} /></>:<div className="state-panel"><h3>Your actual account page appears here</h3><p>It reads the same index, top-up and permissions as every lookup.</p></div>}</div></section><dialog ref={dialog} className="confirm" aria-labelledby="demo-cut-title" onCancel={()=>{setConfirm(false);setAuto(false)}}><h3 id="demo-cut-title">Cut this key's access?</h3><p>This revokes the key on Tempo. It can't be undone.</p><p className="mono">{ready?.child}</p><p>{childRaw ? keySummary(childRaw, keys!.permissionsAtTimestamp) : 'Current permissions are not yet available. The setup created a child with a 3 AlphaUSD cap, one vendor and a two-hour expiry.'}</p><div className="acts"><button className="btn btn-line" onClick={()=>{setConfirm(false);setAuto(false)}}>Cancel</button><button className="btn btn-cut" onClick={confirmCut}>Cut access</button></div></dialog></main>
}
