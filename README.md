# Keycut for Tempo

See who can spend. Cut unwanted access.

M1 API available. Account pages and the interactive demo aren't built yet.

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

Spending limits are checked for known stablecoins only. [Tempo's public token lists](https://tokenlist.tempo.xyz/docs) are snapshotted in `lib/known-tokens.json`, with retrieval date and addresses. cbBTC, MACH, PRIME, wYLDS and YLDS are excluded from this fixed stablecoin subset. Other tokens aren't covered. Expired keys and revoked keys can't spend. Revocation clears permission fields, so the API doesn't present those cleared values as former permissions. Admin history comes from events; the API doesn't infer who created a child key.

## Build the index

```sh
npm run index:build -- --chain testnet
npm run index:build -- --chain mainnet
```

The first build imports complete local `key-index-42431.json` / `key-index-4217.json` snapshots when present, then tops up to a captured latest block. Committed shards make those raw files optional: later builds scan only newer blocks. Without either source, the builder scans from block 0. Failed or skipped ranges abort publication and leave the existing index unchanged. Build offline, then deploy the finished snapshot with the app, never into a running server's directory.

For keys with `enforceLimits: true`, every known stablecoin's remaining limit is read. For uncapped keys, `limitReads` is marked not applicable and `raw.limits` is empty. The public RPC rejects large read batches and rate-limits overlapping batches; the app queues batches of up to eight calls and retries HTTP 429 twice. Public traffic can still produce partial results or delays.

## Checks

```sh
npm test
npm run typecheck
npm run verify
npm run gate
```

`npm test` checks pure permission descriptions, risk flags and shard merging. `npm run verify` uses the product's own index plus live top-up to print the four known testnet keys and covered block ranges, then runs the leftover-key case with fresh throwaway testnet keys and faucet funds. It prints PASS/FAIL for each claim and exits nonzero on any failure. The admin's revoke must leave the child's 1 AlphaUSD payment working; the child's own revoke must stop it. Payment verdicts use vendor balance changes, with a successful control and confirmed revocations. These are seeded test accounts, not real users. No mainnet writes.

Original research gates remain in `scripts/gates/`. `npm run gate` runs the payment gate and writes ignored results. `npm run keywatch` runs the original research gate, including its full-history benchmark and probes; it isn't the product verifier. `npm run index` runs the original full-network read-only probe and can take several minutes. Add `-- --mainnet` for mainnet.
