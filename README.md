# Keycut for Tempo

See who can spend. Cut unwanted access.

Look up an account on testnet or mainnet to see its keys, spending allowances, recipients, expiry and risk flags. Try the [live demo](https://keycut.ajkadri.dev/demo) to see a child key keep paying after its admin is revoked, then stop paying after its own revoke.

## Run

Node.js 20.9 or newer.

```sh
npm ci
npm run build
npm start
```

Open `http://localhost:3000`. `GET /api/blocks` reads the latest block and chain ID from Tempo testnet (42431) and mainnet (4217) on the server. A failed read returns HTTP 503 with that network marked unavailable. Responses aren't cached.

## Find keys

```sh
curl 'http://localhost:3000/api/keys?chain=testnet&address=0x907B843c995E9332caf4A0A832B2B1fbCD1E9477&page=1'
```

Use `chain=testnet|mainnet` and a Tempo account address. Pages contain up to 25 keys, newest first. Lookup loads the account's static shard, scans newer blocks, then reads current permissions at one captured block. Completed results are cached in server memory for 30 seconds. `coveredRanges`, `missingRanges`, `completeThroughBlock`, `discoveryComplete` and `readsComplete` expose coverage and failed reads. A partial result always has `complete: false`.

Open `/testnet/<address>` or `/mainnet/<address>` for the account view. Use Next, Last or the page number to navigate large accounts. Each page sorts active keys by risk, then expired and revoked keys as expandable compact rows. Cards use raw chain fields; expand an address or raw values for the full data. High risk means an active key has no cap, unrestricted calls or an empty recipient list. Review means it is an admin or never expires. Active badges are neutral. The page verdict covers only that page. Dates use your browser's local timezone. Coverage stays visible during loading, errors and scrolling.

`/api/keys` allows 30 requests per IP per minute, returning HTTP 429 with a plain message and `Retry-After`. Counters are held in one server process and reset on restart. Deploy behind Caddy on loopback so its client IP header is trusted.

Spending limits are checked for known stablecoins only. [Tempo's public token lists](https://tokenlist.tempo.xyz/docs) are snapshotted in `lib/known-tokens.json`, with retrieval date and addresses. cbBTC, MACH, PRIME, wYLDS and YLDS are excluded from this fixed stablecoin subset. Other tokens aren't covered. Expired keys and revoked keys can't spend. Revocation clears permission fields, so the API doesn't present those cleared values as former permissions. Admin history comes from events; the API doesn't infer who created a child key.

## Build the index

```sh
npm run index:build -- --chain testnet
npm run index:build -- --chain mainnet
```

The first build imports complete local `key-index-42431.json` / `key-index-4217.json` snapshots when present, then tops up to a captured latest block. Committed shards make those raw files optional: later builds scan only newer blocks. Without either source, the builder scans from block 0. Failed or skipped ranges abort publication and leave the existing index unchanged. Build offline, then deploy the finished snapshot with the app, never into a running server's directory.

Permission profiles for a page are batched through Multicall3 at `0xcA11bde05977b3631167028862bE2a173976CA11`. Bytecode and same-block parity with direct reads were checked on both chains. Active keys with `enforceLimits: true` receive a second page-wide batch for known stablecoin allowances. Expired and revoked keys skip allowances, with an explicit `limitReads` label and empty `raw.limits`. Aggregate failures use bounded direct reads; remaining failures produce a partial result. `permissionReadMethod` and `permissionsAtTimestamp` identify the path and captured status time. RPC delays still vary.

## Checks

```sh
npm test
npm run typecheck
node --import tsx scripts/check-multicall.ts
npm run verify
npm run gate
```

`npm test` checks pure permission descriptions, risk flags and shard merging. `npm run verify` uses the product's own index plus live top-up to print the four known testnet keys and covered block ranges, then runs the leftover-key case with fresh throwaway testnet keys and faucet funds. It also checks a fresh active child's capped permissions through Multicall3. It prints PASS/FAIL for each claim and exits nonzero on any failure. The admin's revoke must leave the child's 1 AlphaUSD payment working; the child's own revoke must stop it. Payment verdicts use vendor balance changes, with a successful control and confirmed revocations. These are seeded test accounts, not real users. No mainnet writes.

Original research gates remain in `scripts/gates/`. `npm run gate` runs the payment gate and writes ignored results. `npm run keywatch` runs the original research gate, including its full-history benchmark and probes; it isn't the product verifier. `npm run index` runs the original full-network read-only probe and can take several minutes. Add `-- --mainnet` for mainnet.

## Testnet demo

`/demo` runs four real steps on Moderato (42431), with the same actual account-view component alongside them and explorer links as transactions complete. All demo accounts are seeded test data, not real users or funds. Payment outcomes come from the vendor’s before/after balance. A refused submission may have no transaction hash; the page says so rather than inventing a link. Unknown outcomes are reported as unconfirmed.

Configure `KEYCUT_BANK_PRIVATE_KEY` and a random `KEYCUT_DEMO_SECRET` (at least 32 characters) in the server environment only. Set `KEYCUT_DEMO_ORIGIN` to the public site origin (for this deployment, `https://keycut.ajkadri.dev`) so POST origin checks work behind the proxy. Use a throwaway testnet bank key, never a mainnet key. Do not commit either value. The bank sends 10 test AlphaUSD to each fresh account. Demo creation never calls the faucet.

```sh
node --import tsx scripts/demo-bank.ts status
node --import tsx scripts/demo-bank.ts top-up
```

Only the explicit `top-up` command calls the faucet for the bank. Check the bank before judging. The public demo allows 5 creation attempts per IP per hour, with HTTP 429 and `Retry-After`. Like lookup limits, this counter is process-local and resets on restart. Deploy one process behind Caddy on loopback.

Demo routes accept only numeric `chainId: 42431` and, for pay/revoke, a server-issued encrypted session. They reject browser-supplied private keys, other networks and cross-origin calls. Revoke accepts only public key IDs recorded inside the issued demo session. Every active key in the live demo has a revoke action; the child action unlocks after its successful control payment. Other active keys show the exact SDK command to run locally with the owner’s client. The permanent example opens a fresh demo for revocation because its signing keys were discarded. Session keys are freshly generated on the server, sealed with authenticated encryption, and never stored on disk. The browser keeps only the opaque token in memory; reloading loses the session. A session expires after two hours. Operations are serialized per account and bank funding is serialized. Tokens are bearer capabilities for these throwaway accounts; an old token cannot restore revoked access.

The home page’s “See a leftover key” opens one permanent seeded example, recorded in `lib/leftover-example.json` with public setup evidence. Its admin is revoked, its child has a 3 test AlphaUSD cap and a one-year expiry. This known relationship comes from setup transactions, not inferred event lineage. The example links prefetch the real product lookup and its server-rendered page, with live coverage. The browser also refreshes the lookup after navigation. No setup or demo bank is needed to view it. Its long expiry is finite and its displayed state is read live.
