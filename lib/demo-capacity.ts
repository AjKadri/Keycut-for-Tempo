// Each demo receives 10 AlphaUSD. Budget another 1 for bank transfer fees.
export const DEMO_FUNDING = 10_000_000n
export const DEMO_FEE_BUDGET = 1_000_000n
export function demoCapacity(balance: bigint) {
  return (balance / (DEMO_FUNDING + DEMO_FEE_BUDGET)).toString()
}
