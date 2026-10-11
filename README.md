# Keycut for Tempo

See who can spend. Cut unwanted access.

M0 scaffold only. Access-key lookup and revocation aren't built yet.

## Run

Node.js 20.9 or newer.

```sh
npm ci
npm run build
npm start
```

Open `http://localhost:3000`. `GET /api/blocks` reads the latest block and chain ID from Tempo testnet (42431) and mainnet (4217) on the server. A failed read returns HTTP 503 with that network marked unavailable. Responses aren't cached.

## Checks

```sh
npm test
npm run typecheck
npm run verify
npm run gate
```

`npm test` is the scan collector's synthetic self-test. `verify` and `gate` use fresh throwaway testnet keys and faucet funds, submit real testnet transactions, and write ignored local result files. They never write to mainnet. `npm run index` runs the original full-network read-only probe, which can take several minutes. Add `-- --mainnet` for mainnet.
