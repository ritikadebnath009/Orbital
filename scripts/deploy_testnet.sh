#!/usr/bin/env bash
# OrbitalDEX — Testnet Deployment Script
#
# Deploys PoolFactory + Router, creates a USDC/XLM pool, and seeds it.
#
# Tokens used:
#   USDC — Circle testnet (issuer: GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5)
#   XLM  — Stellar native asset (SAC: CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC)
#
# Prerequisites:
#   1. stellar CLI ≥ 22.0.0 on PATH
#   2. orbital-deployer key exists and is funded:
#        stellar keys generate orbital-deployer --network testnet --fund
#   3. Deployer holds Circle testnet USDC (get from https://faucet.circle.com)
#      and has a trustline for USDC:GBBD47...
#
# Usage:
#   ./scripts/deploy_testnet.sh            # deploy contracts + create + seed pool
#   ./scripts/deploy_testnet.sh --fund     # also refund deployer via friendbot first

set -euo pipefail

NETWORK="testnet"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
DEPLOYER_KEY="orbital-deployer"

AMP=100
FEE_BPS=4

# USDC: Circle testnet
USDC_ISSUER="GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
USDC_SAC="CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"
# XLM: Stellar native asset SAC (same on testnet and mainnet)
XLM_SAC="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"

PRECISION=10000000      # 7 decimal places (strobes)
SEED_UNITS=200          # 200 USDC + 200 XLM initial liquidity
SEED_AMOUNT=$((SEED_UNITS * PRECISION))

POOL_WASM="contracts/target/wasm32v1-none/release/stable_pool.wasm"
FACTORY_WASM="contracts/target/wasm32v1-none/release/pool_factory.wasm"
ROUTER_WASM="contracts/target/wasm32v1-none/release/router.wasm"

echo "═══════════════════════════════════════════════════"
echo "  OrbitalDEX — Stellar Testnet Deployment"
echo "  Pair: USDC (Circle) / XLM (native)"
echo "═══════════════════════════════════════════════════"

# ── 1. Deployer ───────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--fund" ]]; then
  echo "[1/7] Funding deployer via friendbot..."
  stellar keys generate $DEPLOYER_KEY --network $NETWORK --fund 2>/dev/null || \
    curl -sf "https://friendbot.stellar.org?addr=$(stellar keys address $DEPLOYER_KEY 2>/dev/null | tail -1)" > /dev/null
else
  echo "[1/7] Using existing deployer key..."
fi
ADMIN_ADDRESS=$(stellar keys address $DEPLOYER_KEY 2>/dev/null | tail -1)
echo "      Deployer: $ADMIN_ADDRESS"

# Verify deployer holds USDC (required for pool seeding)
USDC_BAL=$(curl -sf "https://horizon-testnet.stellar.org/accounts/$ADMIN_ADDRESS" | \
  python3 -c "
import sys, json
acc = json.load(sys.stdin)
for b in acc['balances']:
    if b.get('asset_code') == 'USDC' and b.get('asset_issuer','').startswith('GBBD47'):
        print(b['balance'])
        exit()
print('0')
" 2>/dev/null || echo "0")
echo "      Deployer USDC (Circle): $USDC_BAL"

if python3 -c "import sys; exit(0 if float('$USDC_BAL') >= $SEED_UNITS else 1)" 2>/dev/null; then
  echo "      ✓ Sufficient USDC for seeding"
else
  echo ""
  echo "  ⚠️  Deployer needs at least $SEED_UNITS USDC (Circle testnet) to seed the pool."
  echo "  Get USDC from: https://faucet.circle.com"
  echo "  Then set trustline: stellar tx new change-trust --source-account $DEPLOYER_KEY --network testnet --line \"USDC:$USDC_ISSUER\""
  echo ""
  read -p "  Continue anyway? (pool seeding will fail) [y/N] " -n 1 -r
  echo
  [[ $REPLY =~ ^[Yy]$ ]] || exit 1
fi

# ── 2. Build ──────────────────────────────────────────────────────────────────
echo ""
echo "[2/7] Building contracts..."
(cd contracts && stellar contract build 2>&1 | grep -E "Compiling|Finished|error" || true)
echo "      stable_pool  $(du -h $POOL_WASM | cut -f1)"
echo "      pool_factory $(du -h $FACTORY_WASM | cut -f1)"
echo "      router       $(du -h $ROUTER_WASM | cut -f1)"

# ── 3. Upload WASMs ───────────────────────────────────────────────────────────
echo ""
echo "[3/7] Uploading WASMs..."
POOL_WASM_HASH=$(stellar contract upload --network $NETWORK --source $DEPLOYER_KEY --wasm $POOL_WASM 2>/dev/null | tail -1)
FACTORY_WASM_HASH=$(stellar contract upload --network $NETWORK --source $DEPLOYER_KEY --wasm $FACTORY_WASM 2>/dev/null | tail -1)
ROUTER_WASM_HASH=$(stellar contract upload --network $NETWORK --source $DEPLOYER_KEY --wasm $ROUTER_WASM 2>/dev/null | tail -1)
echo "      stable_pool  : $POOL_WASM_HASH"
echo "      pool_factory : $FACTORY_WASM_HASH"
echo "      router       : $ROUTER_WASM_HASH"

# ── 4. Deploy PoolFactory ─────────────────────────────────────────────────────
echo ""
echo "[4/7] Deploying PoolFactory..."
FACTORY_ADDRESS=$(stellar contract deploy \
  --network $NETWORK --source $DEPLOYER_KEY \
  --wasm-hash $FACTORY_WASM_HASH 2>/dev/null | tail -1)
stellar contract invoke \
  --network $NETWORK --source $DEPLOYER_KEY --id $FACTORY_ADDRESS \
  -- initialize --admin "$ADMIN_ADDRESS" --pool_wasm_hash "$POOL_WASM_HASH" > /dev/null 2>&1
echo "      Factory: $FACTORY_ADDRESS"

# ── 5. Deploy Router ──────────────────────────────────────────────────────────
echo ""
echo "[5/7] Deploying Router..."
ROUTER_ADDRESS=$(stellar contract deploy \
  --network $NETWORK --source $DEPLOYER_KEY \
  --wasm-hash $ROUTER_WASM_HASH 2>/dev/null | tail -1)
stellar contract invoke \
  --network $NETWORK --source $DEPLOYER_KEY --id $ROUTER_ADDRESS \
  -- initialize --factory "$FACTORY_ADDRESS" > /dev/null 2>&1
echo "      Router: $ROUTER_ADDRESS"

# ── 6. Create USDC/XLM pool ───────────────────────────────────────────────────
echo ""
echo "[6/7] Creating USDC/XLM pool..."

# Deploy XLM SAC if not already deployed (idempotent)
stellar contract asset deploy \
  --network $NETWORK --source $DEPLOYER_KEY \
  --asset native 2>/dev/null || true

POOL_ADDRESS=$(stellar contract invoke \
  --network $NETWORK --source $DEPLOYER_KEY --id $FACTORY_ADDRESS \
  -- create_pool \
    --creator "$ADMIN_ADDRESS" \
    --token_a "$USDC_SAC" \
    --token_b "$XLM_SAC" \
    --amp $AMP \
    --fee_bps $FEE_BPS 2>/dev/null | tail -1 | tr -d '"')
echo "      USDC/XLM pool: $POOL_ADDRESS"

# ── 7. Seed pool ──────────────────────────────────────────────────────────────
echo ""
echo "[7/7] Seeding pool with ${SEED_UNITS} USDC + ${SEED_UNITS} XLM..."
stellar contract invoke \
  --network $NETWORK --source $DEPLOYER_KEY --id "$POOL_ADDRESS" \
  -- add_liquidity \
    --from "$ADMIN_ADDRESS" \
    --amount_a "$SEED_AMOUNT" \
    --amount_b "$SEED_AMOUNT" \
    --min_shares 1 2>&1 | grep -E "Success|error|Signing" | head -3
echo "      Pool seeded"

VP=$(stellar contract invoke \
  --network $NETWORK --source $DEPLOYER_KEY --id "$POOL_ADDRESS" \
  -- get_virtual_price 2>/dev/null | tail -1)
echo "      Virtual price: $VP (expected 10000000)"

# ── Write output files ────────────────────────────────────────────────────────
cat > deployment.json << EOF
{
  "network": "$NETWORK",
  "deployed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "deployer": "$ADMIN_ADDRESS",
  "wasm_hashes": {
    "stable_pool": "$POOL_WASM_HASH",
    "pool_factory": "$FACTORY_WASM_HASH",
    "router": "$ROUTER_WASM_HASH"
  },
  "contracts": {
    "factory": "$FACTORY_ADDRESS",
    "router": "$ROUTER_ADDRESS"
  },
  "tokens": {
    "usdc": {
      "sac": "$USDC_SAC",
      "issuer": "$USDC_ISSUER",
      "source": "Circle testnet (centre.io)"
    },
    "xlm": {
      "sac": "$XLM_SAC",
      "issuer": null,
      "source": "Stellar native asset"
    }
  },
  "pools": {
    "usdc_xlm": {
      "address": "$POOL_ADDRESS",
      "token_a": "$USDC_SAC",
      "token_b": "$XLM_SAC",
      "amp": $AMP,
      "fee_bps": $FEE_BPS
    }
  }
}
EOF

# frontend/.env.local
ENV_LOCAL="frontend/.env.local"
{
  grep -v "^NEXT_PUBLIC_FACTORY\|^NEXT_PUBLIC_ROUTER\|^NEXT_PUBLIC_POOL\|^NEXT_PUBLIC_USDC\|^NEXT_PUBLIC_XLM\|^# Auto-written" "$ENV_LOCAL" 2>/dev/null || true
} > "${ENV_LOCAL}.tmp" && mv "${ENV_LOCAL}.tmp" "$ENV_LOCAL"
cat >> "$ENV_LOCAL" << EOF

# Auto-written by deploy_testnet.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
NEXT_PUBLIC_FACTORY_ADDRESS=$FACTORY_ADDRESS
NEXT_PUBLIC_ROUTER_ADDRESS=$ROUTER_ADDRESS
NEXT_PUBLIC_POOL_USDC_XLM=$POOL_ADDRESS
NEXT_PUBLIC_USDC_ADDRESS=$USDC_SAC
NEXT_PUBLIC_XLM_ADDRESS=$XLM_SAC
NEXT_PUBLIC_USDC_ISSUER=$USDC_ISSUER
EOF

# backend/.env
BACKEND_ENV="backend/.env"
grep -v "^POOL_ADDRESSES=" "$BACKEND_ENV" 2>/dev/null > "${BACKEND_ENV}.tmp" && mv "${BACKEND_ENV}.tmp" "$BACKEND_ENV"
echo "POOL_ADDRESSES=$POOL_ADDRESS" >> "$BACKEND_ENV"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Deployment complete!"
echo "═══════════════════════════════════════════════════"
echo ""
echo "  Factory     : $FACTORY_ADDRESS"
echo "  Router      : $ROUTER_ADDRESS"
echo "  USDC/XLM    : $POOL_ADDRESS"
echo ""
echo "  Next steps:"
echo "    cd backend  && npm run db:migrate && npm run db:seed && npm run dev"
echo "    cd frontend && npm run dev"
echo ""
