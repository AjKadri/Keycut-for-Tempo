import { isAddress, type Address } from 'viem'
import { walletNetworkConfig, walletTestCall, type WalletNetwork } from './wallet-test'

export type AccountWalletMode = 'owner' | 'other' | 'disconnected'

export function accountWalletEnabled(chain: string, demo: boolean): chain is WalletNetwork {
  return !demo && (chain === 'testnet' || chain === 'mainnet')
}

export function accountWalletMode(chain: string, demo: boolean, connected: string | undefined, viewed: string): AccountWalletMode | undefined {
  if (!accountWalletEnabled(chain, demo)) return undefined
  if (!connected) return 'disconnected'
  return connected.toLowerCase() === viewed.toLowerCase() ? 'owner' : 'other'
}

export function accountWalletNetwork(chain: string): WalletNetwork {
  if (chain !== 'testnet' && chain !== 'mainnet') throw new Error('Wallet cutting is unavailable for this network.')
  return chain
}

export function assertWalletChain(network: WalletNetwork, walletChain: number | string, rpcChain: number) {
  const expected = walletNetworkConfig[network].chainId
  if (Number(walletChain) !== expected || rpcChain !== expected) {
    throw new Error(`The wallet must be on Tempo ${network === 'mainnet' ? 'mainnet 4217' : 'testnet 42431'} for this account.`)
  }
}

export function accountWalletRevokeCall(keyId: string, network: WalletNetwork, loadedKeys: readonly string[]) {
  if (!isAddress(keyId, { strict: false })) throw new Error('Choose a valid access key.')
  if (!loadedKeys.some(cardKey => cardKey.toLowerCase() === keyId.toLowerCase())) throw new Error('This key is not loaded for this account.')
  return walletTestCall('revoke', keyId as Address, undefined, network)
}
