# Architecture

This document describes how OrbitalDEX's pieces fit together. The README
covers setup/deployment/testing per-component; this is the single place that
explains the system as a whole.

## System overview

```
┌─────────────┐      ┌──────────────┐      ┌───────────────────────────┐
│   Frontend   │◄────►│ Soroban RPC  │◄────►│  Contracts (on-chain)     │
│  (Next.js)   │      │  / Horizon   │      │  StablePool × N            │
│              │      │              │      │  PoolFactory               │
│  Freighter   │      └──────────────┘      │  Router                    │
│  wallet signs│             ▲               └───────────────────────────┘
└──────┬───────┘             │ events
       │ REST                │
       ▼                     │
┌─────────────┐      ┌───────┴──────┐
│   Backend    │◄─────│   Indexer     │
│  Express API │      │ (poll-based)  │
│  PostgreSQL  │      └───────────────┘
└─────────────┘
```

The frontend can function with **only** the contracts + RPC — wallet
connection, quotes, swaps, and liquidity all go straight through Soroban RPC.
The backend (indexer + Postgres + REST API) is optional and only powers the
analytics/history pages (`/pools`, `/history`) with richer, queryable data
than what's available from live RPC calls alone. This is why
`useProtocolStats()` on the frontend falls back to on-chain reads when the
backend isn't reachable rather than showing nothing.

## Contracts

Three Soroban contracts, in `contracts/`:

- **`stable_pool`** — the AMM itself. One instance per trading pair. Holds
  reserves, LP shares, and implements the Curve StableSwap invariant
  (`src/math.rs`) for swaps, deposits, and withdrawals. Admin-gated
  operations (pause, ramp amplification, propose/execute upgrade) all live
  here too.
- **`pool_factory`** — deploys new `stable_pool` instances via
  `env.deployer().deploy_v2()`, using a stored WASM hash so all pools run the
  same code. Maintains the canonical `(token_a, token_b) -> pool address`
  registry (`get_pool`, `get_all_pools`) that both the router and the backend
  rely on. `pause_all()` is the emergency stop — it iterates every registered
  pool via `try_invoke_contract` so one broken/unresponsive pool can't block
  the rest (see `pause_all` test in `pool_factory/src/test.rs` for the
  partial-failure case).
- **`router`** — stateless route-finding and atomic multi-hop execution. Asks
  the factory for the pool registry, simulates 1-hop and 2-hop routes via
  each candidate pool's `get_swap_result`, and executes the best one. The
  router never holds tokens — pools transfer directly to/from the calling
  user, authorized once via `from.require_auth()` at the top of `swap()`.

### Why a factory instead of one big pool contract

Each trading pair gets its own contract instance (rather than one contract
tracking many pairs internally) so a bug or pause in one pool can't touch
another, and so per-pool storage/instruction costs don't grow with the
number of pairs OrbitalDEX supports. The tradeoff is that routing across
pairs (the router's job) requires cross-contract calls instead of local
lookups.

### Upgrade path

Both `stable_pool` and `pool_factory` use a two-phase, 48-hour-timelocked
upgrade (`propose_upgrade` → wait → `execute_upgrade`, or `cancel_upgrade` to
abort). This was added in response to the audit's HIGH-5 finding (the
original `upgrade()` replaced running WASM instantly, with no delay for
anyone to notice and react to a compromised admin key). See `SECURITY.md`
for the operational procedure.

## Backend

`backend/src/`:

- **`indexer/stellar.ts`** — polls Soroban RPC `getEvents` for each known
  pool's `swap`/`add_liq`/`rm_liq`/`pause`/`amp_upd` events and parses them
  into a normalized `PoolEvent` shape.
- **`indexer/discovery.ts`** — separately polls the factory's `pool_new`
  events and registers newly created pools (both into the `pools` table and
  into the running indexer's watch list), so a pool created through the
  frontend's Create Pool flow gets indexed automatically instead of needing
  a manual `POOL_ADDRESSES` update and restart.
- **`indexer/events.ts`** — `EventProcessor` drives both of the above on a
  timer, tracks a ledger cursor per source in `indexer_state` (so restarts
  resume rather than replay), and persists events into Postgres inside a
  transaction.
- **`analytics/snapshots.ts`** — periodically records `pool_snapshots` (TVL,
  reserves, virtual price) so the frontend can chart history without
  recomputing it from raw events each time.
- **`api/`** — Express REST layer (`/api/pools`, `/api/history`,
  `/api/faucet`) reading from Postgres. Rate-limited (HIGH-7).

The indexer and snapshot worker are optional at boot — if Postgres isn't
reachable, the HTTP server still starts and serves what it can (contract
reads still work; DB-backed analytics endpoints return errors until the DB
is up). See `backend/src/index.ts`.

## Frontend

`frontend/src/`:

- **`lib/contract.ts`** — all Soroban RPC interaction (simulate for reads,
  build+sign+submit for writes) funnels through `simulateContractCall` /
  `executeContractTx`. Both take a `ContractType` ("pool" | "factory" |
  "router") so a failed call's error code resolves against the right
  contract's error table (`lib/contractErrors.ts`) instead of a generic one.
- **`hooks/`** — one hook per concern: wallet connection (`useWallet`),
  token balance + trustline status (`useTokenBalance`, `useTrustlines`),
  router quotes (`useRouterSwap`), live event polling (`usePoolEvents`), and
  aggregate protocol stats read straight from contracts
  (`useProtocolStats`).
- **`components/swap/SwapCard.tsx`** — the main swap UI; owns slippage
  tolerance, quote display, and the actual swap execution call.

### Data flow for a swap

1. User types an amount → `useRouterSwap` debounces and calls
   `router.get_quote` (a read-only simulation — no signature, no fee).
2. User clicks Swap → `executeRouterSwap` builds the real transaction,
   Freighter signs it, it's submitted and polled for confirmation.
3. On confirmation, the pool contract has emitted a `swap` event. The
   frontend's `usePoolEvents` hook (polling Horizon directly) and the
   backend indexer (polling RPC `getEvents`) both eventually pick it up —
   the frontend path is what makes the swap show up in the UI within
   seconds; the backend path is what makes it show up in `/pools` and
   `/history`'s richer aggregated views.

## Testing

Contract tests (`cargo test --workspace`) use real Stellar Asset Contracts
via `env.register_stellar_asset_contract_v2()` rather than mock tokens, so
the token interface under test matches what Circle's testnet USDC and
Stellar's native XLM actually expose on-chain. `router`'s and
`pool_factory`'s tests additionally import the compiled `stable_pool` WASM
(`contractimport!`) to test real cross-contract calls rather than a stub.

The frontend has unit tests for pure logic (`lib/`, `hooks/` helpers) via
Vitest; there's no end-to-end browser test suite currently — manual
verification against a live testnet deployment is the current practice (see
the Demo Walkthrough in the README).
