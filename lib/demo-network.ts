export const DEMO_CHAIN_ID = 42431

export function demoChainAllowed(value: unknown): value is typeof DEMO_CHAIN_ID {
  return value === DEMO_CHAIN_ID
}
