# Keycut for Tempo

![Keycut logo](public/logo.png)

See who can spend. Cut unwanted access.

[Live app](https://keycut.ajkadri.dev) · [Live demo](https://keycut.ajkadri.dev/demo) · [Permanent leftover key](https://keycut.ajkadri.dev/testnet/0xE5CB1Dd82e60Df2A1cd6b58dF218aea7d535521A)

Keycut lists the access keys that can spend from a Tempo account and explains each one in plain words. Tempo's [TIP-1049](https://github.com/tempoxyz/tempo/blob/main/tips/tip-1049.md) leaves a child key active when its admin key is revoked, so an old agent can keep payment access after the agent is retired. Keycut finds that leftover access and lets the owner cut it on testnet.

## Try it in 60 seconds

1. Click "Create a test account" to fund a fresh throwaway testnet account from the demo bank.
2. The setup gives an agent an admin key that can create other access keys.
3. The agent creates a child key with a 3 AlphaUSD cap, one vendor and a two-hour expiry.
4. The demo cuts the admin key, while the child key stays active.
5. Click "Pay with the child key" and check the vendor balance change from 0 to 1 AlphaUSD.
6. Confirm "Cut access" to revoke the child key through the real keychain.
7. Click "Try to pay again" and check that the vendor balance stays unchanged.

The first four setup steps run together when you choose "Run every step". Every transaction link comes from the live Tempo testnet response. Test AlphaUSD has no value.

![Home hero after the seeded cut](public/screenshots/hero.png)

![Hero cut animation](public/screenshots/hero-cut.gif)

![Permanent leftover example with the active child card and coral risk flag](public/screenshots/account.png)

![Live demo just after child revoke, with the revoked card and confirmation toast](public/screenshots/account-cut.png)

![Completed live demo with all seven steps and the real account view](public/screenshots/demo.png)

![Learn page try-it after revoking the admin illustration](public/screenshots/learn.png)

![Home page at 390px](public/screenshots/mobile.png)

## Cut access with your own wallet

The unlinked [/wallet-test](https://keycut.ajkadri.dev/wallet-test) page is a testnet-only gate through Tempo Wallet and the Tempo Accounts SDK. It creates one disposable key and requests only the keychain's `revokeKey` write when you choose "Cut access". The human wallet gate is still pending in the current browser environment, so there are no wallet-gate transaction links to claim. The page shows the receipt, `getKey` result, explorer link and signing evidence after a human completes it.

Testnet account pages are ready for owner cutting after that gate is verified. Mainnet lookup is live. Mainnet cutting stays disabled until a separate human mainnet gate passes, and the app makes no other mainnet writes.

## Numbers

On Tempo testnet, 229,526 accounts hold 303,164 access keys. 3.6% of them were ever revoked.

On mainnet, 5,422 accounts hold 12,512 keys and 6.1% were ever revoked. There are no admin keys on mainnet yet.

These figures come from the committed index snapshots dated 11 Oct 2026: [testnet metadata](public/index/42431/meta.json) and [mainnet metadata](public/index/4217/meta.json). They are snapshot counts, not a claim about current totals.

## How it works

Keycut discovers `KeyAuthorized`, `AdminKeyAuthorized` and `KeyRevoked` events from the Tempo account keychain. It starts with committed shards, tops up from the latest block, and reports the exact covered range or a partial result.

For each page, it reads `getKey`, `isAdminKey`, `getAllowedCalls` and active capped-key allowances. Multicall3 batches the permission reads on both chains after parity checks against direct reads. The UI builds each card from these raw fields, so the sentence, status, risk flags and expandable details stay consistent.

The demo uses a pre-funded testnet bank and fresh server-generated throwaway keys. Payment outcomes come from the vendor's balance and confirmed key state.

## Verify it yourself

Open the [live demo](https://keycut.ajkadri.dev/demo), the [permanent leftover key](https://keycut.ajkadri.dev/testnet/0xE5CB1Dd82e60Df2A1cd6b58dF218aea7d535521A), or the [known four-key account](https://keycut.ajkadri.dev/testnet/0x907B843c995E9332caf4A0A832B2B1fbCD1E9477). Then run the public verifier:

```sh
npm ci
npm run verify
```

`scripts/verify.ts` prints the four known keys and their covered block range from the product index plus top-up, then runs the leftover-key case on a fresh testnet account. It prints `PASS` or `FAIL` for each claim and exits nonzero on failure. Expected claims include:

```text
PASS Product finds the four known keys from the address
PASS Two known keys are revoked
PASS Discovery covers all history through the latest captured block
PASS Live permissions are available
PASS Admin key issues the child key
PASS Product batches active capped permissions correctly
PASS Child pays before revocation
PASS Child still pays after its admin key is revoked
PASS Revoking the child stops its payment
```

## Safety and operations

The product never accepts or stores a private key from the browser. Demo keys are throwaway testnet keys generated on the server, and demo routes accept only chain 42431. Demo creation is rate-limited per IP, and lookup requests have a per-IP limit. Server setup, environment variables, bank maintenance, rate limits and index operations are documented in [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Licence

Keycut is released under the [MIT License](LICENSE).
