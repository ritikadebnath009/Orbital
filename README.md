# OrbitalDEX

A production-grade **Curve-style StableSwap DEX** built natively on **Stellar Soroban**.  
Swap stablecoins (USDC, USDT, EURC) and native XLM with near-zero slippage through a mathematically precise AMM.

---

| Resource | URL |
|-----------|-----|
| 🌐 Live Application | https://orbitalstellar.vercel.app/ |
| 🎥 Demo Video | https://www.youtube.com/watch?v=OBQrVJKmrFU |

---

## Project Overview

OrbitalDEX implements the **Curve Finance StableSwap invariant** on Stellar Soroban. Unlike constant-product AMMs (Uniswap-style), StableSwap uses an amplification parameter `A` to concentrate liquidity near a 1:1 price ratio — giving stablecoin traders near-zero slippage on small-to-medium swaps.

**Live on Stellar Testnet.** Contracts deployed and seeded with real on-chain liquidity. A live swap of 1000 USDC → 999.59 EURC was confirmed on-chain with 0.04% fee.

---

## Architecture

```
orbital/
├── contracts/                    # Soroban smart contracts (Rust)
│   ├── stable_pool/              # Core AMM: StableSwap math, LP shares, events
│   │   ├── src/lib.rs            # Contract entry points
│   │   ├── src/math.rs           # Curve invariant D, swap, withdrawal
│   │   ├── src/events.rs         # Event emission (swap, add_liq, rm_liq, pause)
│   │   ├── src/storage.rs        # Persistent storage abstractions
│   │   └── src/errors.rs         # Contract error codes
│   ├── pool_factory/             # Deploys pool instances, maintains registry
│   │   ├── src/lib.rs
│   │   ├── src/events.rs         # pool_created, wasm_hash_updated events
│   │   └── src/storage.rs
│   └── router/                   # Route finding and atomic multi-hop execution
│       └── src/lib.rs
├── backend/                      # TypeScript event indexer + REST API
│   └── src/
│       ├── api/                  # Express REST endpoints
│       ├── indexer/              # Horizon SSE event subscription
│       └── analytics/            # Snapshot worker (TVL, volume)
├── frontend/                     # Next.js 16 DEX interface
│   └── src/
│       ├── app/                  # Next.js App Router pages
│       ├── components/           # UI components
│       ├── hooks/                # React hooks (wallet, balances, events)
│       └── lib/                  # Stellar SDK wrappers
├── scripts/
│   └── deploy_testnet.sh         # Full deployment automation
└── .github/
    └── workflows/ci.yml          # CI/CD pipeline
```

### Contract Interaction Flow

```
User → Frontend → [Freighter wallet signs tx]
                ↓
         Soroban RPC
                ↓
      Router.swap(from, tokenIn, tokenOut, amountIn, minOut, deadline)
                ↓
      [Route finding: 1-hop direct or 2-hop via intermediate]
                ↓
      Pool.swap(from, tokenIn, amountIn, minOut)
         ↙          ↘
   TokenIn.transfer   TokenOut.transfer
   (user → pool)      (pool → user)
                ↓
         Event emitted: (swap, user) → (tokenIn, tokenOut, amountIn, amountOut, fee, ra, rb)
```

### StableSwap Math

The invariant: `A·N^N·∑x + D = A·N^N·D + D^(N+1) / (N^N · ∏x)`

Where:
- `A` = amplification coefficient (higher = flatter curve = less slippage)
- `N` = number of tokens (2)
- `D` = total pool value invariant
- `x_i` = token reserves

Solved via Newton-Raphson iteration. At `A=100`, slippage <1 bps for swaps <0.1% of TVL.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Rust + Soroban SDK 22.x |
| Blockchain | Stellar Testnet (Soroban) |
| Token Standard | SEP-41 / Stellar Asset Contracts (SAC) |
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS v4, Framer Motion |
| Wallet | Freighter via `@stellar/freighter-api` |
| Stellar SDK | `@stellar/stellar-sdk` v15 |
| Backend | Node.js, TypeScript, Express |
| Database | PostgreSQL |
| Tests (contracts) | Soroban test SDK (native) |
| Tests (frontend) | Vitest + React Testing Library |
| CI/CD | GitHub Actions |

---

# Screenshots

## Mobile responsive 
<img width="352" height="737" alt="Screenshot 2026-06-23 at 2 46 42 AM" src="https://github.com/user-attachments/assets/2e927130-3c68-4dfa-8625-d1651797a98b" />

## CI/CD Pipelines
<img width="1454" height="838" alt="Screenshot 2026-06-23 at 2 49 18 AM" src="https://github.com/user-attachments/assets/06f11133-6646-46db-96b9-dc474f9d802b" />

## Installation Guide

### Prerequisites

- **Rust** ≥ 1.75 with `wasm32v1-none` target
- **stellar CLI** ≥ 23.4.1 (`cargo install stellar-cli`)
- **Node.js** 20+
- **PostgreSQL** 14+ (for backend analytics — optional)

### 1. Clone and setup contracts

```bash
git clone <repo-url>
cd orbital/contracts

# Add wasm target
rustup target add wasm32v1-none

# Run tests
cargo test --workspace

# Build release WASMs
cargo build --release --target wasm32v1-none
```

### 2. Deploy to testnet

```bash
# Generate and fund deployer key
stellar keys generate orbital-deployer --network testnet --fund

# Get Circle testnet USDC (required for USDC pools)
# Visit: https://faucet.circle.com

# Run deployment script
cd ..
./scripts/deploy_testnet.sh
# Writes deployment.json and frontend/.env.local automatically
```

### 3. Run the frontend

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:3000
```

### 4. Run the backend (optional — for analytics)

```bash
cd backend
cp .env.example .env
# Set DATABASE_URL and POOL_ADDRESSES in .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

---

## Environment Variables

### Frontend (`frontend/.env.local`)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` or `mainnet` | `testnet` |
| `NEXT_PUBLIC_STELLAR_RPC_URL` | Soroban RPC endpoint | `https://soroban-testnet.stellar.org` |
| `NEXT_PUBLIC_HORIZON_URL` | Horizon API endpoint | `https://horizon-testnet.stellar.org` |
| `NEXT_PUBLIC_FACTORY_ADDRESS` | PoolFactory contract ID | `CCR5FGHX...` |
| `NEXT_PUBLIC_ROUTER_ADDRESS` | Router contract ID | `CCSFJCPD...` |
| `NEXT_PUBLIC_USDC_ADDRESS` | USDC SAC contract ID | `CBIELTK6...` |
| `NEXT_PUBLIC_USDT_ADDRESS` | USDT SAC contract ID | `CA7MHOQD...` |
| `NEXT_PUBLIC_EURC_ADDRESS` | EURC SAC contract ID | `CDZEYIBQ...` |
| `NEXT_PUBLIC_XLM_ADDRESS` | Native XLM SAC ID | `CDLZFC3S...` |
| `NEXT_PUBLIC_POOL_USDT_XLM` | USDT/XLM pool address | `CDQQIW45...` |
| `NEXT_PUBLIC_POOL_USDT_EURC` | USDT/EURC pool address | `CCIVPHQD...` |
| `NEXT_PUBLIC_API_URL` | Backend API URL | `http://localhost:4000` |

### Backend (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `STELLAR_RPC_URL` | Soroban RPC URL |
| `POOL_ADDRESSES` | Comma-separated pool contract IDs |
| `PORT` | HTTP server port (default: 4000) |

---

## Smart Contract Deployment Guide

### Contract addresses (Stellar Testnet)

| Contract | Address |
|----------|---------|
| **PoolFactory** | `CCR5FGHX3E7QLBRK6VCWEIFO4UGQEGE3C4S4C6HPDTRJ6I4DOVVYJYC6` |
| **Router** | `CCSFJCPDZMKYCEOROOWQDF35OZUQFITTOIO45VKMKTU4NAFZVLUS6ZZF` |
| USDT/XLM Pool | `CDQQIW45ILUZ4AGGZ7W2HQEHKZQ4KSWRRC4OF5VRAU3IXXXTFY7DQM4V` |
| USDT/EURC Pool | `CCIVPHQD3FJXRXY45UAYX226MD647TZLYSZEJKSOWGUMFUCMG5R2WPFV` |

### Token contracts (SAC)

| Token | SAC Address | Issuer |
|-------|-------------|--------|
| USDT | `CA7MHOQDFUHH5CZF66YFFONG6QT6SER7KO4PD7BLXBRF3KQTCECMQ34S` | `GDGZB5QL...` |
| USDC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` | Circle testnet |
| EURC | `CDZEYIBQSBSFED4F56EUGZB3LOFINAQETXODVFM4CACG4UY27WKHT5OE` | `GAJVZHJ5...` |
| XLM  | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` | Native |

### WASM hashes

| Contract | Hash |
|----------|------|
| stable_pool | `bbab9303...736dd6` |
| pool_factory | `f2e5f0d0...2116d` |
| router | `58de261b...6801` |

### Manual deployment steps

```bash
# 1. Build
cd contracts
cargo build --release --target wasm32v1-none

# 2. Upload WASMs
POOL_HASH=$(stellar contract upload --network testnet --source orbital-deployer \
  --wasm target/wasm32v1-none/release/stable_pool.wasm)

FACTORY_HASH=$(stellar contract upload --network testnet --source orbital-deployer \
  --wasm target/wasm32v1-none/release/pool_factory.wasm)

ROUTER_HASH=$(stellar contract upload --network testnet --source orbital-deployer \
  --wasm target/wasm32v1-none/release/router.wasm)

# 3. Deploy factory
FACTORY=$(stellar contract deploy --network testnet --source orbital-deployer \
  --wasm-hash $FACTORY_HASH)
stellar contract invoke --network testnet --source orbital-deployer --id $FACTORY \
  -- initialize --admin $(stellar keys address orbital-deployer) --pool_wasm_hash $POOL_HASH

# 4. Deploy router
ROUTER=$(stellar contract deploy --network testnet --source orbital-deployer \
  --wasm-hash $ROUTER_HASH)
stellar contract invoke --network testnet --source orbital-deployer --id $ROUTER \
  -- initialize --factory $FACTORY

# 5. Create a pool
POOL=$(stellar contract invoke --network testnet --source orbital-deployer --id $FACTORY \
  -- create_pool --creator $(stellar keys address orbital-deployer) \
  --token_a $USDC_SAC --token_b $XLM_SAC --amp 100 --fee_bps 4)
```

### Rollback strategy

The contracts include a **2-day upgrade timelock**. To cancel a proposed upgrade:

```bash
stellar contract invoke --network testnet --source orbital-deployer --id $POOL_ADDRESS \
  -- cancel_upgrade
```

To pause all pools in an emergency:

```bash
stellar contract invoke --network testnet --source orbital-deployer --id $FACTORY_ADDRESS \
  -- pause_all
```

---

## Event Streaming Architecture

### On-chain events

Every important state change emits a Soroban event:

| Event | Contract | Topic | Data |
|-------|----------|-------|------|
| `swap` | StablePool | `(swap, user)` | `(tokenIn, tokenOut, amountIn, amountOut, fee, reserveA, reserveB)` |
| `add_liq` | StablePool | `(add_liq, provider)` | `(amountA, amountB, sharesMinted, reserveA, reserveB)` |
| `rm_liq` | StablePool | `(rm_liq, provider)` | `(sharesBurned, amountA, amountB, reserveA, reserveB)` |
| `pause` | StablePool | `(pause, admin)` | `(paused: bool)` |
| `amp_upd` | StablePool | `(amp_upd, admin)` | `(oldAmp, newAmp)` |
| `pool_created` | PoolFactory | `(pool_created, creator)` | `(pool, tokenA, tokenB, amp, feeBps)` |
| `wasm_hash_updated` | PoolFactory | `(wasm_hash_updated, admin)` | `(oldHash, newHash)` |

### Backend event indexer

The backend subscribes to Horizon's Server-Sent Events (SSE) stream and persists events to PostgreSQL:

```
Horizon SSE /accounts/{pool}/effects?cursor=now
  → StellarEventIndexer (src/indexer/stellar.ts)
    → EventProcessor (src/indexer/events.ts)
      → PostgreSQL (swap_events, liquidity_events tables)
        → REST API (src/api/server.ts)
          → Frontend event feed
```

### Frontend real-time updates

The `usePoolEvents` hook polls Horizon every 15 seconds for new pool transactions and displays them in the `EventFeed` component on the analytics page. The polling interval is configurable and the hook automatically reconnects after network errors.

---

## Frontend Architecture

```
src/
├── app/                       # Next.js App Router
│   ├── page.tsx               # Landing page with swap card
│   ├── pools/
│   │   ├── page.tsx           # Analytics dashboard + EventFeed
│   │   ├── create/page.tsx    # Create pool UI
│   │   └── [address]/page.tsx # Individual pool detail
│   ├── liquidity/page.tsx     # Add/remove liquidity
│   ├── history/page.tsx       # Transaction history
│   └── portfolio/page.tsx     # LP position dashboard
├── components/
│   ├── swap/SwapCard.tsx      # Main swap interface
│   ├── pool/
│   │   ├── PoolStats.tsx      # On-chain reserves + virtual price
│   │   ├── SwapHistory.tsx    # Per-pool swap history
│   │   └── EventFeed.tsx      # Real-time event stream
│   └── ui/Button.tsx          # Shared button component
├── hooks/
│   ├── useWallet.ts           # Freighter connection + signing
│   ├── useTokenBalance.ts     # On-chain balance polling
│   ├── useTrustlines.ts       # Classic trustline management
│   ├── useRouterSwap.ts       # Router quote simulation
│   └── usePoolEvents.ts       # Real-time event polling
└── lib/
    ├── stellar.ts             # Network config + token registry
    ├── contract.ts            # Soroban contract interaction
    ├── trustline.ts           # ChangeTrust transaction building
    └── utils.ts               # Tailwind class merge helpers
```

### Data flow

1. User enters swap amount → `useRouterSwap` debounces and calls `router.get_quote` via simulation
2. Quote shown → user clicks Swap → `executeRouterSwap` builds + signs + submits tx via Freighter
3. Tx confirmed on-chain → swap event emitted → `usePoolEvents` picks it up on next poll
4. UI refreshes balances automatically

---

## Testing Instructions

### Smart contract tests

```bash
cd contracts

# Run all tests (58 total: 42 pool + 8 factory + 8 router)
cargo test --workspace -- --nocapture

# Run a specific contract
cargo test -p stable_pool
cargo test -p pool_factory
cargo test -p router

# Run with test output
RUST_LOG=debug cargo test --workspace 2>&1 | tee test_output.txt
```

**Test coverage:**
- StablePool: initialization, deposits (balanced/single-sided), withdrawals, swaps, slippage, pause, ramp-A, spot price, simulation, virtual price, protocol fees, upgrade timelock
- PoolFactory: initialization, pool creation, duplicate prevention, cross-contract pool invocation, `pause_all`
- Router: 1-hop quotes, 2-hop quotes, direct swaps, 2-hop swaps, expired deadline, slippage exceeded, no-route error

### Frontend tests

```bash
cd frontend

# Run all tests
npm run test

# Run in watch mode
npm run test:watch

# Run with coverage report
npm run test:coverage
```

**Frontend test files:**
- `src/__tests__/stellar-utils.test.ts` — `toStrobes`, `fromStrobes`, `formatAmount`, PRECISION constant
- `src/__tests__/Button.test.tsx` — Button component: render, click, disabled, loading states
- `src/__tests__/contract-utils.test.ts` — `calculatePriceImpact` edge cases

### Expected test output

```
 RUN  v4.1.9 /Users/.../orbital/frontend

 ✓  src/__tests__/stellar-utils.test.ts  (14 tests)
 ✓  src/__tests__/Button.test.tsx         (7 tests)
 ✓  src/__tests__/contract-utils.test.ts  (5 tests)

 Test Files  3 passed (3)
      Tests  26 passed (26)
```

---

## CI/CD Pipeline Documentation

The pipeline is defined in `.github/workflows/ci.yml` and runs on every push to `main`/`dev` and on all pull requests.

### Jobs

| Job | Triggers | Steps |
|-----|---------|-------|
| `contracts` | All pushes/PRs | Clippy lint → WASM build → `cargo test --workspace` → Upload WASM artifacts |
| `frontend` | All pushes/PRs | `npm ci` → ESLint → `tsc --noEmit` → `npm run test` → `npm run build` → Upload build artifact |
| `backend` | All pushes/PRs | `npm ci` → `tsc --noEmit` |
| `deploy-gate` | `main` branch only | Passes only when all three jobs succeed |

### Artifacts

- `wasm-artifacts` — Release WASMs retained for 7 days (used for deployment)
- `nextjs-build` — Production Next.js build retained for 3 days

### Pipeline configuration

```yaml
# Contracts: lint before build
- cargo clippy --workspace -- -D warnings
- cargo build --release --target wasm32v1-none
- cargo test --workspace -- --nocapture

# Frontend: test before build
- npx tsc --noEmit
- npm run test       # Vitest — 24 tests
- npm run build      # Next.js production build
```

---

## Deployment Guide

### Production environment setup

1. **Secret management** — Store private keys in GitHub Secrets or HashiCorp Vault. Never commit keys.
2. **Environment variables** — Set all `NEXT_PUBLIC_*` values in your deployment platform (Vercel, Render, etc.)
3. **RPC endpoints** — Use a dedicated RPC provider (not public endpoints) for production load.

### Frontend deployment (Vercel — recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd frontend
vercel --prod

# Set environment variables in Vercel dashboard or CLI:
vercel env add NEXT_PUBLIC_STELLAR_NETWORK
vercel env add NEXT_PUBLIC_FACTORY_ADDRESS
# ... add all NEXT_PUBLIC_* vars
```

### Backend deployment (Railway / Render)

```bash
# Set these environment variables in your platform:
DATABASE_URL=postgres://user:pass@host:5432/orbital
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
POOL_ADDRESSES=CDQQIW45...,CCIVPHQD...
PORT=4000

# The backend auto-starts the event indexer and analytics workers
npm start
```

### Contract deployment (new environment)

Run the automated script:
```bash
./scripts/deploy_testnet.sh --fund
```

This script:
1. Funds the deployer via Friendbot (with `--fund`)
2. Builds all three contracts
3. Uploads WASMs and captures hashes
4. Deploys PoolFactory + Router
5. Creates a USDC/XLM pool and seeds it
6. Writes `deployment.json` and `frontend/.env.local`

### Verification steps

After deployment:
```bash
# Verify factory is live
stellar contract invoke --network testnet --id $FACTORY_ADDRESS -- pool_count

# Verify router is connected
stellar contract invoke --network testnet --id $ROUTER_ADDRESS -- get_factory

# Verify pool is seeded
stellar contract invoke --network testnet --id $POOL_ADDRESS -- get_reserves
stellar contract invoke --network testnet --id $POOL_ADDRESS -- get_virtual_price
```

---

## Demo Walkthrough

### Step 1: Connect wallet

1. Install [Freighter](https://freighter.app) browser extension
2. Switch Freighter to **Testnet**
3. Visit the app and click **Connect Wallet**

### Step 2: Get test tokens

- Click **Get XLM** in the swap card (sends 10,000 XLM via Friendbot)
- Visit [faucet.circle.com](https://faucet.circle.com) for testnet USDC

### Step 3: Enable token access (trustlines)

- If prompted, click **Enable Tokens in Wallet**
- This submits a ChangeTrust operation for each SEP-41 token
- Approve in Freighter

### Step 4: Execute a swap

1. Select **USDT** → **XLM** (or any available pair)
2. Enter amount (e.g., "100")
3. Quote appears showing estimated output and price impact
4. Adjust slippage tolerance if needed (default 0.5%)
5. Click **Swap USDT → XLM**
6. Approve in Freighter
7. Wait for on-chain confirmation (usually <10 seconds on testnet)

### Step 5: View analytics

- Navigate to **Analytics** → see live pool stats, reserves, and swap history
- The **Live Activity** feed shows recent on-chain transactions

### Step 6: Add liquidity

- Navigate to **Liquidity**
- Select a pool (e.g., USDT/XLM)
- Enter amounts for each token
- Click **Add Liquidity** — receive LP shares proportional to your contribution

---

## Contract Addresses & Transaction Hashes

### Deployed contracts (Stellar Testnet — 2026-06-09)

| Contract | Address |
|----------|---------|
| PoolFactory | `CCR5FGHX3E7QLBRK6VCWEIFO4UGQEGE3C4S4C6HPDTRJ6I4DOVVYJYC6` |
| Router | `CCSFJCPDZMKYCEOROOWQDF35OZUQFITTOIO45VKMKTU4NAFZVLUS6ZZF` |
| USDT/XLM Pool | `CDQQIW45ILUZ4AGGZ7W2HQEHKZQ4KSWRRC4OF5VRAU3IXXXTFY7DQM4V` |
| USDT/EURC Pool | `CCIVPHQD3FJXRXY45UAYX226MD647TZLYSZEJKSOWGUMFUCMG5R2WPFV` |

### Key transaction hashes

| Event | Transaction Hash |
|-------|-----------------|
| Live swap (1000 USDC → 999.59 EURC) | `a66ee789...` |
| USDT/XLM pool seeded | Ledger ~3,800,000 |
| USDT/EURC pool seeded | Ledger ~3,800,100 |

> **Verify on-chain:** `https://stellar.expert/explorer/testnet/contract/{address}`

### Stellar Expert links

- [Factory](https://stellar.expert/explorer/testnet/contract/CCR5FGHX3E7QLBRK6VCWEIFO4UGQEGE3C4S4C6HPDTRJ6I4DOVVYJYC6)
- [Router](https://stellar.expert/explorer/testnet/contract/CCSFJCPDZMKYCEOROOWQDF35OZUQFITTOIO45VKMKTU4NAFZVLUS6ZZF)
- [USDT/XLM Pool](https://stellar.expert/explorer/testnet/contract/CDQQIW45ILUZ4AGGZ7W2HQEHKZQ4KSWRRC4OF5VRAU3IXXXTFY7DQM4V)

---

## License

MIT
