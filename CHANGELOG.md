# Changelog

## Level 5 — Audit follow-up, real usage, and onboarding (2026-07-13)

### Smart contracts

- **Fix (LOW-1):** `get_spot_price` probed with a full 1-token swap, which on
  small or imbalanced pools traveled far enough along the StableSwap curve to
  return a secant price instead of the true marginal price. The probe now
  scales to a small fraction of the input reserve, staying close to the
  current point on the curve regardless of pool size or imbalance, while the
  return value keeps its original `PRECISION`-scaled unit.
- **Tests:** closed the three gaps flagged in `auditreport.md`'s Test
  Coverage Analysis — a D-never-decreases property test and a virtual-price
  monotonicity test across 40 randomized swaps each (deterministic xorshift64
  PRNG, no new crate dependency), plus upgrade-timelock regression tests
  (execution blocked before the 48h window elapses, cancellation clears the
  pending upgrade). `cargo test --workspace` now covers 73 tests, up from 58.
- **Upgrade proposed on testnet:** a new `stable_pool` WASM containing the
  LOW-1 fix was uploaded and `propose_upgrade` was called on the live
  USDT/EURC pool. See `deployment.json` → `pending_upgrades` for the hash,
  transaction IDs, and the exact timestamp `execute_upgrade` becomes callable
  — the 48h timelock (HIGH-5) is a deliberate safety property, so this
  genuinely cannot be completed faster.

### Frontend

- **Fix:** the landing page and market section rendered hardcoded, fabricated
  numbers ("$38.4M 24h Volume", "$124.6M TVL", "2,841 Active Traders", fake
  per-token USD prices with fake 24h changes) with no relationship to the
  actual live pools. Replaced with `useProtocolStats()`, which reads real
  reserves/virtual price/fee straight from the deployed contracts, and pulls
  real swap counts/volume from the backend indexer when it's reachable —
  fields that need the (optional) backend and aren't available render as "—"
  instead of a fabricated fallback.
- **Fix:** contract error codes were mapped through a single router-only
  table regardless of which contract actually raised the error (e.g. a
  pool's `InsufficientLiquidity`, code 6, rendered as the router's "Invalid
  amount"), and transaction execution didn't translate errors at all,
  surfacing raw `Error(Contract, #6)` strings. Added per-contract error
  tables (`contractErrors.ts`) matching the Rust `#[contracterror]` enums
  exactly, threaded through every simulate/execute call site.
- **Feature:** added a first-time "Getting Started" checklist driven by real
  app state (wallet connection, trustline status, and flags set on actual
  successful faucet/swap transactions) instead of a static tutorial —
  surfaces the README's Demo Walkthrough steps in-app.

### Real testnet activity (2026-07-13, `orbital-deployer`)

All verifiable at `https://stellar.expert/explorer/testnet/tx/{hash}`:

| Action | Pool | Detail | Tx Hash |
|---|---|---|---|
| Swap | USDT/EURC | 10 USDT → 9.9950106 EURC | `779de51d10351a65fc3f849cbe1660ba621e58246d0cb55cd1d9b2d633de5df2` |
| Swap | USDT/XLM | 5 USDT → 10.2047430 XLM | `841f3c2ad738bf4cfde5a11f1e1c462396d9259d0d63beb5709b280f9abe3137` |
| Add liquidity | USDT/EURC | 20 USDT + 20 EURC → 39.9998596 shares | `4b9f8f02c48b33e5ef8dfa774bf6d26e0b247ab024c5b72c25bd92fdeea3f1d3` |
| Remove liquidity | USDT/EURC | 10 shares → 5.0490199 USDT + 4.9510051 EURC | `4b558ab26a963256fae3d9b6ca5e48353d686353edf7cc97891149a540d89e81` |
| Upload WASM | — | `stable_pool` build with the LOW-1 fix | `3888eb5c44065f1e988c9e035f562b730295f80012d291fcac859114586e2e1b` |
| Propose upgrade | USDT/EURC | new WASM hash, unlocks 2026-07-15T16:03:54Z | `da18f87ee3e817abb8115f73a56c04bd4252681fe3aa5282ce7ca6b23511eb82` |

The USDT/EURC pool's virtual price moved from `1.0000000` to `1.0000020`
after this activity — the fee-in-reserve accounting the test suite checks
for is observable on real, live pool state, not just in `cargo test`.
