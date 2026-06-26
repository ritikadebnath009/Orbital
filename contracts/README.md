# OrbitalDEX Smart Contracts

Stellar Soroban smart contracts implementing a Curve-style StableSwap DEX for stablecoin trading with minimal slippage.

## Contracts

| Contract | Description |
|----------|-------------|
| `stable_pool` | Two-token StableSwap pool implementing the Curve invariant. Supports add/remove liquidity, swaps, and amplification parameter ramping. |
| `pool_factory` | Deploys `StablePool` instances on-chain and maintains a token-pair → pool registry. |
| `router` | Finds optimal 1-hop or 2-hop swap routes across registered pools and executes them atomically with slippage protection. |

## Folder Structure

```
contracts/
├── Cargo.toml          # Workspace manifest
├── Cargo.lock
├── Makefile
├── stable_pool/
│   └── src/
│       ├── lib.rs      # Pool contract (initialize, swap, add/remove liquidity)
│       ├── math.rs     # StableSwap invariant (compute_d, compute_swap)
│       ├── storage.rs  # Persistent state helpers
│       ├── errors.rs   # PoolError enum
│       ├── events.rs   # Contract events
│       ├── test.rs     # Integration tests
│       └── test_lp_profit.rs
├── pool_factory/
│   └── src/
│       ├── lib.rs      # Factory contract (create_pool, get_pool, get_all_pools)
│       ├── storage.rs
│       ├── events.rs
│       └── test.rs
└── router/
    └── src/
        ├── lib.rs      # Router contract (get_quote, swap)
        ├── storage.rs
        └── test.rs
```

## Build

```bash
# Install wasm target (first time only)
rustup target add wasm32v1-none

# Build all contracts to WASM
make build
# or: cargo build --target wasm32v1-none --release
```

## Test

```bash
make test
# or: cargo test --workspace
```

## Format & Lint

```bash
make fmt
make lint
```

## Deploy

```bash
export STELLAR_SECRET_KEY=<your-secret-key>
make deploy
```

Or deploy each contract individually with `stellar contract deploy`:

```bash
stellar contract deploy \
  --wasm target/wasm32v1-none/release/stable_pool.wasm \
  --source $STELLAR_SECRET_KEY \
  --network testnet
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `STELLAR_SECRET_KEY` | Deployer account secret key (S...) |
| `STELLAR_NETWORK` | `testnet` or `mainnet` |
| `SOROBAN_RPC_URL` | Soroban RPC endpoint (e.g. `https://soroban-testnet.stellar.org`) |

## Deployment Order

1. Deploy `stable_pool` WASM hash (uploaded but not instantiated)
2. Deploy `pool_factory` — pass the `stable_pool` wasm hash
3. Deploy `router` — pass the factory address
4. Call `factory.create_pool(token_a, token_b, amp, fee_bps)` for each pool
