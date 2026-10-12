import { encodeFunctionData, isAddress, type Address, type Hex } from 'viem'
import { Abis, Addresses } from 'viem/tempo'

export const WALLET_TEST_CHAIN = 42431
export const WALLET_TEST_FEE_TOKEN = '0x20c0000000000000000000000000000000000001' as const
export const WALLET_MAINNET_CHAIN = 4217
export const WALLET_MAINNET_FEE_TOKEN = '0x20c0000000000000000000000000000000000000' as const
export const WALLET_MAINNET_MIN_FEE_BALANCE = 100_000n
export type WalletNetwork = 'testnet' | 'mainnet'

export const walletNetworkConfig = {
  testnet: {
    chainId: WALLET_TEST_CHAIN,
    chainHex: '0xa5bf' as Hex,
    feeToken: WALLET_TEST_FEE_TOKEN,
    feeTokenName: 'AlphaUSD',
    explorer: 'https://explore.testnet.tempo.xyz',
    expirySeconds: 3600n,
  },
  mainnet: {
    chainId: WALLET_MAINNET_CHAIN,
    chainHex: '0x1079' as Hex,
    feeToken: WALLET_MAINNET_FEE_TOKEN,
    feeTokenName: 'pathUSD',
    explorer: 'https://explore.tempo.xyz',
    expirySeconds: 600n,
  },
} as const satisfies Record<WalletNetwork, {
  chainId: number
  chainHex: Hex
  feeToken: Address
  feeTokenName: string
  explorer: string
  expirySeconds: bigint
}>

export function walletTestCall(action: 'authorize' | 'revoke', key: Address, expiry?: bigint, network: WalletNetwork = 'testnet') {
  if (action === 'authorize' && !expiry) throw new Error('An expiry is required.')
  const config = walletNetworkConfig[network]
  const mainnet = network === 'mainnet'
  return {
    to: Addresses.accountKeychain as Address,
    data: action === 'authorize'
      ? encodeFunctionData({ abi: Abis.accountKeychain, functionName: 'authorizeKey', args: [key, 0, {
        expiry: expiry!,
        // The mainnet probe key must be unable to spend or call anything.
        enforceLimits: mainnet,
        limits: [],
        allowAnyCalls: !mainnet,
        allowedCalls: [],
      }] })
      : encodeFunctionData({ abi: Abis.accountKeychain, functionName: 'revokeKey', args: [key] }),
    value: '0x0' as Hex, chainId: config.chainHex, feeToken: config.feeToken,
  }
}
// Only an observed signature envelope establishes the signing path.
export function walletTestSigner(signature: unknown): string {
  if (!signature || typeof signature !== 'object') return 'Unverified: RPC did not expose a recognized signature envelope.'
  const envelope = signature as { type?: unknown; keyId?: unknown; userAddress?: unknown; signature?: unknown }
  const implicitKeychain = envelope.type === undefined && typeof envelope.userAddress === 'string'
    && isAddress(envelope.userAddress) && envelope.signature !== null && typeof envelope.signature === 'object'
  if (envelope.type === 'keychain' || implicitKeychain) return `Session/access key (keychain signature)${typeof envelope.keyId === 'string' ? `: ${envelope.keyId}` : ''}.`
  if (['secp256k1', 'p256', 'webAuthn'].includes(String(envelope.type))) return `Account’s main key (${envelope.type} signature).`
  return `Unverified signing path: ${String(envelope.type ?? 'missing signature type')}.`
}
