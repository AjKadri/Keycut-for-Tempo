'use client'
import { useRef, useState } from 'react'
import { formatUnits, isAddress, type Address, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts'
import { tempo, tempoModerato } from 'viem/chains'
import { Abis, Addresses, createClient } from 'viem/tempo'
import {
  walletNetworkConfig,
  walletTestCall,
  walletTestSigner,
  WALLET_MAINNET_MIN_FEE_BALANCE,
  type WalletNetwork,
} from '../lib/wallet-test'

type Provider = import('accounts').Provider.Provider
const clients = {
  testnet: createClient({ chain: tempoModerato, cacheTime: 0 }),
  mainnet: createClient({ chain: tempo, cacheTime: 0 }),
} as const
const json = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2)
type TestKey = { id: Address; owner: Address; expiry: string; network: WalletNetwork }
type Evidence = { action: string; network: WalletNetwork; account: Address; key: Address; hash: Hex; receipt?: string; getKey?: unknown; signer?: string; signature?: unknown; claim?: string }

export function WalletTest() {
  const provider = useRef<Provider | null>(null)
  const lock = useRef(false)
  const [network, setNetwork] = useState<WalletNetwork>('testnet')
  const [mainnetAcknowledged, setMainnetAcknowledged] = useState(false)
  const [address, setAddress] = useState<Address>()
  const [chainId, setChainId] = useState<number>()
  const [key, setKey] = useState<TestKey>()
  const [balance, setBalance] = useState<bigint>()
  const [busy, setBusy] = useState('')
  const [errors, setErrors] = useState<{ action: string; message: string; detail: string }[]>([])
  const [evidence, setEvidence] = useState<Evidence[]>([])
  const [confirm, setConfirm] = useState(false)
  const [funding, setFunding] = useState('')
  const config = walletNetworkConfig[network]
  const publicClient = clients[network]

  function error(action: string, value: unknown) {
    setErrors(prior => [...prior, { action, message: value instanceof Error ? value.message : String(value),
      detail: value instanceof Error ? value.stack ?? value.message : json(value) ?? String(value) }])
  }
  async function run(action: string, fn: () => Promise<void>) {
    if (lock.current) return
    lock.current = true; setBusy(action)
    try { await fn() } catch (value) { error(action, value) }
    finally { lock.current = false; setBusy('') }
  }
  function selectNetwork(next: WalletNetwork) {
    if (next === network) return
    setNetwork(next)
    setAddress(undefined); setChainId(undefined); setKey(undefined); setBalance(undefined)
    setEvidence([]); setErrors([]); setFunding(''); setConfirm(false)
  }
  async function checkedAccount(expected: Address | undefined, mode: WalletNetwork) {
    if (!provider.current) throw new Error('Connect Tempo Wallet first.')
    const selected = walletNetworkConfig[mode]
    const [walletChain, accounts, rpcChain] = await Promise.all([
      provider.current.request({ method: 'eth_chainId' }),
      provider.current.request({ method: 'eth_accounts' }),
      clients[mode].getChainId(),
    ])
    setChainId(Number(walletChain))
    const current = accounts[0]
    if (!current || !isAddress(current)) { setAddress(undefined); throw new Error('The wallet has no connected account.') }
    setAddress(current)
    if (Number(walletChain) !== selected.chainId || rpcChain !== selected.chainId) {
      throw new Error(`The wallet must be on Tempo ${mode === 'mainnet' ? 'mainnet 4217' : 'testnet 42431'} for this gate.`)
    }
    if (expected && current.toLowerCase() !== expected.toLowerCase()) throw new Error('The connected account changed. Reconnect the account that owns this test key.')
    return current
  }
  async function readBalance(account: Address, mode: WalletNetwork = network) {
    const amount = await clients[mode].readContract({ address: walletNetworkConfig[mode].feeToken, abi: Abis.tip20, functionName: 'balanceOf', args: [account] })
    if (mode === network) setBalance(amount)
    return amount
  }
  async function connect() {
    await run('Connect Tempo Wallet', async () => {
      if (network === 'mainnet' && !mainnetAcknowledged) throw new Error('Tick “I understand this uses real stablecoin for fees.” before connecting to mainnet.')
      if (!provider.current) {
        const sdk = await import('accounts')
        const wallet = sdk.Provider.create({ adapter: sdk.tempoWallet(), chains: [tempoModerato, tempo], testnet: true,
          storage: sdk.Storage.memory(), persistCredentials: false })
        wallet.on('accountsChanged', accounts => { setAddress(accounts[0]); setBalance(undefined); setConfirm(false) })
        wallet.on('chainChanged', chain => { setChainId(Number(chain)); setBalance(undefined); setConfirm(false) })
        provider.current = wallet
      }
      await provider.current.request({ method: 'wallet_connect', params: [{ chainId: config.chainHex }] })
      const account = await checkedAccount(undefined, network)
      await readBalance(account, network)
    })
  }
  async function transact(action: 'authorize' | 'revoke', test: TestKey) {
    const mode = test.network
    const account = await checkedAccount(test.owner, mode)
    if (mode === 'mainnet') {
      const available = await readBalance(account, mode)
      if (available < WALLET_MAINNET_MIN_FEE_BALANCE) throw new Error(`This wallet has ${formatUnits(available, 6)} pathUSD. At least 0.1 pathUSD is required for the two mainnet fee payments.`)
    }
    const hash = await provider.current!.request({ method: 'eth_sendTransaction', params: [{ from: account,
      ...walletTestCall(action, test.id, BigInt(test.expiry), mode),
    }] })
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error(`Wallet returned an invalid transaction hash: ${String(hash)}`)
    const item: Evidence = { action: action === 'authorize' ? 'Create a test key' : 'Cut access', network: mode, account, key: test.id, hash }
    setEvidence(prior => [...prior, item])
    const update = (fields: Partial<Evidence>) => setEvidence(prior => prior.map(entry => entry.hash === hash ? { ...entry, ...fields } : entry))
    let receipt: Awaited<ReturnType<typeof clients[typeof mode]['waitForTransactionReceipt']>> | undefined
    try {
      receipt = await clients[mode].waitForTransactionReceipt({ hash, timeout: 90_000 })
      update({ receipt: receipt.status })
    } catch (value) { error(`${item.action}: receipt`, value); update({ receipt: 'Unconfirmed' }) }
    // These reads are independent: an unavailable signature must not hide getKey.
    try {
      const info = await clients[mode].readContract({ address: Addresses.accountKeychain, abi: Abis.accountKeychain,
        functionName: 'getKey', args: [account, test.id], blockNumber: receipt?.blockNumber })
      const passed = action === 'revoke' ? info.isRevoked
        : info.keyId.toLowerCase() === test.id.toLowerCase() && !info.isRevoked && info.expiry === BigInt(test.expiry) && info.enforceLimits === (mode === 'mainnet')
      const expected = action === 'revoke' ? 'getKey confirms Revoked' : mode === 'mainnet' ? 'getKey confirms an expiry-limited no-call key' : 'getKey confirms the one-hour uncapped test key'
      update({ getKey: info, claim: `${passed ? 'PASS' : 'FAIL'} ${expected}.` })
    } catch (value) { error(`${item.action}: getKey`, value); update({ claim: 'FAIL getKey could not be read.' }) }
    try {
      const transaction = await clients[mode].request({ method: 'eth_getTransactionByHash', params: [hash] })
      const signature = transaction && 'signature' in transaction ? transaction.signature : undefined
      update({ signer: walletTestSigner(signature), signature })
    } catch (value) { error(`${item.action}: signature read`, value); update({ signer: 'Unverified: transaction signature could not be read.' }) }
    try { await readBalance(account, mode) } catch (value) { error('Fee balance read', value) }
  }
  async function create() {
    await run('Create a test key', async () => {
      if (network === 'mainnet' && !mainnetAcknowledged) throw new Error('Tick “I understand this uses real stablecoin for fees.” before creating a mainnet test key.')
      const owner = await checkedAccount(key?.owner, network)
      const available = await readBalance(owner, network)
      if (network === 'mainnet' && available < WALLET_MAINNET_MIN_FEE_BALANCE) throw new Error(`This wallet has ${formatUnits(available, 6)} pathUSD. At least 0.1 pathUSD is required for the two mainnet fee payments.`)
      const head = await publicClient.getBlock({ blockTag: 'latest' })
      // Retain only the public ID. The disposable signing secret is discarded immediately.
      const test = key ?? { id: privateKeyToAddress(generatePrivateKey()), owner, expiry: String(head.timestamp + walletNetworkConfig[network].expirySeconds), network }
      setKey(test)
      await transact('authorize', test)
    })
  }
  async function cut() {
    setConfirm(false)
    await run('Cut access', async () => {
      if (!key) throw new Error('Create the disposable test key first.')
      await transact('revoke', key)
    })
  }
  async function fund() {
    await run('Get test funds', async () => {
      if (network === 'mainnet') throw new Error('The faucet is disabled on mainnet. Fees come from your wallet.')
      const account = await checkedAccount(address, 'testnet')
      await clients.testnet.faucet.fundSync({ account, timeout: 60_000 })
      setFunding(`Faucet completed for ${account}. Test funds only.`)
      await readBalance(account, 'testnet')
    })
  }
  const owner = Boolean(address && key && address.toLowerCase() === key.owner.toLowerCase() && key.network === network)
  const created = evidence.some(item => item.network === network && item.action === 'Create a test key' && item.claim?.startsWith('PASS'))
  const connected = chainId === config.chainId && Boolean(address)
  const enoughMainnetFees = network === 'testnet' || (balance !== undefined && balance >= WALLET_MAINNET_MIN_FEE_BALANCE)
  const enabled = !busy && connected && enoughMainnetFees && (network === 'testnet' || mainnetAcknowledged)
  const explorer = (item: Evidence) => `${walletNetworkConfig[item.network].explorer}/tx/${item.hash}`
  const expiryCopy = network === 'mainnet' ? '10 minutes' : 'one hour'
  return <main className="account-shell wallet-test">
    <div className="wallet-test-network" role="group" aria-label="Wallet gate network">
      <button type="button" className={network === 'testnet' ? 'selected' : ''} aria-pressed={network === 'testnet'} onClick={() => selectNetwork('testnet')}>Testnet</button>
      <button type="button" className={network === 'mainnet' ? 'selected' : ''} aria-pressed={network === 'mainnet'} onClick={() => selectNetwork('mainnet')}>Mainnet</button>
    </div>
    {network === 'mainnet' && <label className="wallet-test-warning"><input type="checkbox" checked={mainnetAcknowledged} onChange={event => setMainnetAcknowledged(event.target.checked)} /> I understand this uses real stablecoin for fees.</label>}
    <p className="eyebrow">{network === 'mainnet' ? 'Mainnet · 4217 · real stablecoin fees' : 'Test network only · Moderato 42431 · Not real funds'}</p>
    <h1>Run the wallet revoke gate</h1>
    <p>{network === 'mainnet'
      ? 'This unlinked gate uses your Tempo Wallet on mainnet. It creates one disposable access key that cannot spend or make calls, expires in ten minutes, then revokes it. The server never signs, stores keys or pays fees.'
      : 'This unlinked test page creates one disposable, uncapped access key that expires in one hour, then lets its owner cut access. Its private key is discarded. No payments or mainnet actions are available.'}</p>
    <p>Use an unlocked browser with your Tempo Wallet passkey. Keep this tab open until the test finishes. Reloading loses the test key ID from this page.</p>
    <button disabled={Boolean(busy) || (network === 'mainnet' && !mainnetAcknowledged)} onClick={connect}>Connect Tempo Wallet</button>
    <p>Connected address: <code>{address ?? 'Not connected'}</code></p>
    <p>Wallet network: {chainId ?? 'Not connected'}. The only mainnet writes this page can request are authorizeKey and revokeKey.</p>
    {address && <><p>Fee balance: {balance === undefined ? 'Not read' : `${formatUnits(balance, 6)} ${config.feeTokenName}`}. Fees come from this wallet.</p>{network === 'mainnet' && balance !== undefined && balance < WALLET_MAINNET_MIN_FEE_BALANCE && <p className="state-panel partial" role="alert">This wallet has too little {config.feeTokenName} for the two mainnet fee payments. Add at least 0.1 {config.feeTokenName}, then reconnect.</p>}{network === 'testnet' && balance === 0n && <button disabled={!connected || Boolean(busy)} onClick={fund}>Get test funds</button>}</>}
    {funding && <p role="status">{funding}</p>}
    <div className="wallet-test-actions"><button disabled={!enabled || created || Boolean(key && !owner)} onClick={create}>Create a test key</button>{' '}<button disabled={!enabled || !owner} onClick={() => setConfirm(true)}>Cut access</button></div>
    {key && <div className="notice"><p>Disposable {key.network} key: <code>{key.id}</code></p><p>Owner: <code>{key.owner}</code></p><p>Requested expiry: {new Date(Number(key.expiry) * 1000).toLocaleString()} ({expiryCopy} after the captured chain block).</p><p>{key.network === 'mainnet' ? 'No token limits and no call permissions. It cannot spend or make calls.' : 'No cap. Can call anything.'} Signing secret discarded.</p>{!owner && <p>Only this account's owner can revoke its keys.</p>}</div>}
    {confirm && key && <section className="notice" aria-label="Confirm cutting access"><h2>Cut this key's access? This revokes the key on Tempo. It can't be undone.</h2><p>Key: <code>{key.id}</code>. Current permissions: {key.network === 'mainnet' ? 'no token limits, no call permissions and a ten-minute expiry.' : 'no cap, any call and a one-hour expiry.'} Check the getKey result below for its current state.</p><button disabled={!enabled || !owner} onClick={cut}>Cut access</button>{' '}<button onClick={() => setConfirm(false)}>Cancel</button></section>}
    {busy && <p role="status">{busy}: waiting for the wallet or {network}…</p>}
    {evidence.map((item, index) => <section className="key-card" key={`${item.hash}:${index}`}><h2>{item.action}</h2><p><a href={explorer(item)} target="_blank" rel="noreferrer">View transaction on Tempo {item.network}</a></p><p>Receipt: {item.receipt ?? 'Pending'}</p><p>{item.claim ?? 'Waiting for getKey confirmation.'}</p><p>Wallet signed with: {item.signer ?? 'Not yet read from the transaction.'}</p><h3>getKey result</h3><pre>{item.getKey ? json(item.getKey) : 'Not available yet'}</pre><details><summary>Transaction signature envelope</summary><pre>{json(item.signature) ?? 'Not available'}</pre><p>A keychain envelope proves access-key signing. It does not prove that the key was created by this SDK session.</p></details></section>)}
    {errors.length > 0 && <section role="alert"><h2>Errors, verbatim</h2>{errors.map((item, index) => <div className="notice" key={index}><p>{item.action}</p><pre>{item.message}</pre><details><summary>Full error detail</summary><pre>{item.detail}</pre></details></div>)}</section>}
  </main>
}
