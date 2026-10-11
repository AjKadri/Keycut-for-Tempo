# Keycut for Tempo

Keycut helps Tempo account owners find access keys, understand what they can spend and cut unwanted access.

## The problem

Removing an agent’s admin key can leave its child key active. On Tempo testnet, that child can still pay until it expires or is revoked itself. Mainnet lookups work too, but this admin-and-child case is demonstrated only on testnet.

An address lookup combines indexed key events with a live top-up and current permissions. It shows coverage, allowances, recipients, expiry and access before risk. It doesn't infer which key created another key.

## Walk through the leftover key

All accounts below are seeded testnet accounts. Test AlphaUSD isn't real money.

1. Open [the live demo](https://keycut.ajkadri.dev/demo) and choose **Create demo account**. A pre-funded bank sends 10 test AlphaUSD to a fresh account. An admin creates a child with a 3 AlphaUSD cap and one allowed vendor. The owner revokes the admin. The actual account panel pins the child first and labels its setup-known relationship.

   ![A revoked admin leaves its child active, shown first in the live account panel](public/screenshots/leftover-key.jpg)

2. Choose **Make the child pay**. The child sends 1 test AlphaUSD after the admin has been revoked. The vendor’s before/after balance proves the payment, and the transaction link is shown.
3. Choose **Revoke key** on the child card, or **Revoke the child key** in step 3. The real keychain state changes, and the card becomes a compact revoked row.
4. Choose **Attempt the payment**. The vendor receives 0. The explanation comes from its unchanged balance and the child’s confirmed revocation. An unbroadcast refusal has no transaction link. Transport or receipt uncertainty is reported as unconfirmed.

   ![The four completed steps show the successful control and zero received after child revocation](public/screenshots/demo-complete.jpg)

The [permanent leftover example](https://keycut.ajkadri.dev/testnet/0xE5CB1Dd82e60Df2A1cd6b58dF218aea7d535521A) needs no setup or bank funding. Its child has a small cap and a finite one-year expiry. Its signing keys were discarded, so its action opens a fresh demo. The admin link is known from setup evidence, not read from the chain.

## How Tempo is used

- Networks: Moderato testnet, chain 42431, and mainnet, chain 4217. `viem@2.57.4` supplies the Tempo client, account types and keychain ABI. All writes are testnet-only.
- Discovery: `KeyAuthorized`, `AdminKeyAuthorized` and `KeyRevoked` logs from the account keychain at `0xaAAAaaAA00000000000000000000000000000000`. Static shards cover indexed history. An account-specific `eth_getLogs` top-up scans later blocks in bounded ranges, with four workers. Missing ranges remain visible as partial coverage.
- Permissions: `getKey`, `isAdminKey`, `getAllowedCalls` and `getRemainingLimitWithPeriod`, at one captured block. Page-wide reads use Multicall3 at `0xcA11bde05977b3631167028862bE2a173976CA11`, verified against direct reads on both networks. Only active keys with enforced limits get allowance reads. Bounded direct reads handle aggregate failures.
- Revocation: the owner’s `client.accessKey.revokeSync({ accessKey: keyId })` calls the keychain’s `revokeKey`. The child itself must be revoked. Revoking its admin doesn't revoke the child. The admin creates the child with `authorizeKey`. Payments use TIP-20 `transfer`, with explicit gas and vendor balance checks.
- Limits: a fixed known-stablecoin subset from Tempo’s token lists. Other tokens aren't covered. `transferFrom` isn't covered by spending limits. Raw fields are expandable.

## Verify it yourself

Open [Keycut](https://keycut.ajkadri.dev), [the permanent example](https://keycut.ajkadri.dev/testnet/0xE5CB1Dd82e60Df2A1cd6b58dF218aea7d535521A), or [the known four-key account](https://keycut.ajkadri.dev/testnet/0x907B843c995E9332caf4A0A832B2B1fbCD1E9477).

Node.js 20.9 or newer:

```sh
npm ci
npm run verify
```

The verifier prints the keys and block ranges from the product’s index plus top-up. It creates one fresh throwaway testnet account, seeds it with faucet funds, and prints PASS or FAIL per claim. Expected claims include:

```text
PASS Product finds the four known keys from the address: 4 keys found using the product index plus top-up
PASS Two known keys are revoked: 2 revoked keys
PASS Discovery covers all history through the latest captured block: Complete: all 4 keys found, checked through block <block>.
PASS Live permissions are available: permissions read at block <block>
PASS Admin key issues the child key: <explorer link>
PASS Product batches active capped permissions correctly: fresh child allowance 20000000 base units; reads via multicall3
PASS Child pays before revocation: vendor balance change 1000000 base units
PASS Child still pays after its admin key is revoked: admin revoked=true, vendor balance change 1000000 base units
PASS Revoking the child stops its payment: revoked=true, vendor balance change 0 base units
```

Any failed claim exits nonzero. No hosted-indexer probe or mainnet write. The standalone verifier uses the faucet once per run. Public demo creation never calls it.

```sh
npm test
npm run typecheck
node --import tsx scripts/check-multicall.ts
npm run index:build -- --chain testnet
npm run index:build -- --chain mainnet
npm run build
npm start
```

Open `http://localhost:3000`. Index builds merge only newer blocks into committed shards. A failed scan leaves the published snapshot unchanged. Build away from the running server, then deploy the completed snapshot with the app. Home shows each `meta.json` snapshot’s counts and date. Lookups return up to 25 keys per page and cache complete results for 30 seconds. API pages are newest-first; cards sort within the current page, with the known demo child first. A headline on a multi-page account describes only that page.

For the live demo, set `KEYCUT_BANK_PRIVATE_KEY`, `KEYCUT_DEMO_SECRET` (at least 32 random characters), and `KEYCUT_DEMO_ORIGIN` in the server environment. Never commit their values. Use a throwaway testnet bank. Check [health](https://keycut.ajkadri.dev/api/health) for conservative remaining capacity, budgeting 10 test AlphaUSD for funding and 1 for bank fees per demo. It reveals no credentials.

```sh
node --import tsx scripts/demo-bank.ts status
node --import tsx scripts/demo-bank.ts top-up
```

Only explicit `top-up` calls the faucet for the bank. Deploy one process behind Caddy on loopback. Lookups allow 30 requests per IP per minute, demo creation five per hour. Plain 429 responses include `Retry-After`; counters reset on restart. Demo sessions are encrypted, authenticated, expire after two hours and stay only in browser memory. Reloading loses the session. Routes refuse other chains, browser private keys and unrelated key IDs. Interrupted setup may leave a funded throwaway account.

## What is shipped

| State | What it covers |
|---|---|
| Live | Address discovery, history top-up, current permissions, raw reads, page navigation and coverage on testnet/mainnet. Testnet demo transactions, child revoke and balance-based refusal. Multicall parity script. |
| Seeded | Fresh bank-funded testnet demo accounts and one permanent leftover example. The child/admin link comes only from known setup. |
| Snapshot | Network counts and event history in dated committed shards. Later events are read during account top-up. |
| Simplified | Known stablecoins only; 30-second cache; process-local rate limits; conservative bank capacity. High risk means uncapped spending, unrestricted calls or empty recipients. Review covers admin keys or expiry beyond 30 days, including no expiry. RPC latency can vary. |
| Not built | Connected-wallet revoke for real accounts, inferred lineage, spend history, scheduled refresh, alerts or automatic revoke. Real accounts get an exact owner-client command to copy. |

## What comes next

Record the live demo and pitch videos. After the demo video, the planned next work is connected-wallet revocation, proven lineage, spend history and scheduled index refresh. None is claimed as shipped.

Licensed under [MIT](LICENSE).
