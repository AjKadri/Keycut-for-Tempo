# Operations

## Run the app

Use Node.js 20.9 or newer. `viem` stays pinned at 2.57.4.

```sh
npm ci
npm test
npm run typecheck
npm run build
npm start
```

Open `http://localhost:3000`. The app uses plain `next start`, static index files and live RPC reads. It needs no database. Deploy one process behind Caddy on loopback so its client IP header is trusted.

`GET /api/blocks` reads the latest block and chain ID of testnet (42431) and mainnet (4217) from the server. Unavailable networks return HTTP 503. `GET /api/health` reads conservative testnet bank capacity without exposing credentials. It budgets 10 test AlphaUSD for each account and 1 for bank transfer fees. A failed bank read returns HTTP 503 with null capacity.

## Refresh the index

```sh
npm run index:build -- --chain testnet
npm run index:build -- --chain mainnet
```

The first build can import complete local `key-index-42431.json` and `key-index-4217.json` snapshots. Committed shards make those raw files optional. Later builds scan only blocks after `meta.json.completeThroughBlock` and merge new events into 256 shards per network. Without an index or import, the builder starts at block 0.

Failed or skipped ranges abort publication and preserve the existing snapshot. Build away from the running server, then deploy the completed snapshot with the app. Home reads the counts and timestamp from each `meta.json`. Refresh is manual.

## Lookups

```sh
curl 'http://localhost:3000/api/keys?chain=testnet&address=0x907B843c995E9332caf4A0A832B2B1fbCD1E9477&page=1'
```

Use `chain=testnet|mainnet` and a valid Tempo account address. API pages contain up to 25 keys, newest first. Cards sort within that page by active risk, expired and revoked state, with the known demo child first. Multi-page verdicts describe only the current page.

Lookup loads a shard, scans newer events and reads current permissions at one captured block. Complete lookups are cached in server memory for 30 seconds. `coveredRanges`, `missingRanges`, `completeThroughBlock`, `discoveryComplete` and `readsComplete` expose gaps. Any failed range or permission read produces a partial result.

`/api/keys` allows 30 requests per IP per minute. Demo creation allows five attempts per IP per hour. HTTP 429 responses use a plain message and `Retry-After`. These counters are held in one process and reset on restart. RPC delays vary.

## Configure the testnet demo

Set these values in the server environment only:

| Variable | Purpose |
|---|---|
| `KEYCUT_BANK_PRIVATE_KEY` | A throwaway testnet bank key. Never use a mainnet key. |
| `KEYCUT_DEMO_SECRET` | At least 32 random characters for authenticated encrypted sessions. |
| `KEYCUT_DEMO_ORIGIN` | The public origin, such as `https://keycut.ajkadri.dev`, for POST origin checks behind the proxy. |

Never commit the values. The bank funds each fresh account with 10 test AlphaUSD. Demo creation never calls the faucet. Check capacity before a demo:

```sh
node --import tsx scripts/demo-bank.ts status
node --import tsx scripts/demo-bank.ts top-up
```

Only explicit `top-up` calls the faucet for the bank. The existing permanent example needs no funding or setup to view. Its signing keys were discarded; do not create another example to refresh its state.

Routes accept only numeric `chainId: 42431`. Pay and revoke require a server-issued authenticated session. Routes reject browser private keys, other networks, unrelated key IDs and cross-origin calls. Sessions expire after two hours and stay only in browser memory. Reloading loses the session. Keys are generated on the server, encrypted into the session and never written to disk. Bank funding and per-account actions are serialized. Interrupted setup may leave a funded throwaway account. A standalone account tab has no session capability, so it shows the owner-client command.

## Verification

```sh
npm test
npm run typecheck
node --import tsx scripts/check-multicall.ts
npm run verify
```

The parity script checks Multicall3 bytecode and compares all four permission reads with direct calls at the same block on both chains. Aggregate failures in the product fall back to bounded direct reads. Unresolved failures stay partial.

The product verifier prints the known testnet keys and coverage, then creates one fresh faucet-funded testnet account for the leftover-key case. It checks a successful control, confirmed admin/child revocations and vendor balance changes. It exits nonzero on a failed claim. It makes no mainnet writes and runs no hosted-indexer probe.

Original research scripts remain in `scripts/gates/`. `npm run keywatch` runs the original gate with benchmarks and probes. `npm run index` runs the original network probe and may take several minutes. Neither is needed to view the hosted product.
