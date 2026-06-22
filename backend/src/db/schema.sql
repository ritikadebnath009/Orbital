-- OrbitalDEX Database Schema
-- PostgreSQL 14+
-- Idempotent: safe to re-run (all creates use IF NOT EXISTS)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Pools ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pools (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    address         VARCHAR(56) NOT NULL UNIQUE,
    token_a         VARCHAR(56) NOT NULL,
    token_b         VARCHAR(56) NOT NULL,
    token_a_symbol  VARCHAR(12),
    token_b_symbol  VARCHAR(12),
    amp             BIGINT NOT NULL,
    fee_bps         INTEGER NOT NULL,
    deployed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_paused       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_pools_address ON pools(address);

-- ── Pool Snapshots (time-series, every ~5 min) ────────────────────────────────

CREATE TABLE IF NOT EXISTS pool_snapshots (
    id              BIGSERIAL PRIMARY KEY,
    pool_id         UUID NOT NULL REFERENCES pools(id),
    ledger          BIGINT NOT NULL,
    ts              TIMESTAMPTZ NOT NULL,
    reserve_a       NUMERIC(30, 7) NOT NULL,
    reserve_b       NUMERIC(30, 7) NOT NULL,
    total_shares    NUMERIC(30, 7) NOT NULL,
    virtual_price   NUMERIC(30, 7) NOT NULL,
    tvl_usd         NUMERIC(20, 2),
    d               NUMERIC(30, 7) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_pool_ts ON pool_snapshots(pool_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_ledger  ON pool_snapshots(ledger);

-- ── Swaps ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS swaps (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pool_id         UUID NOT NULL REFERENCES pools(id),
    ledger          BIGINT NOT NULL,
    ts              TIMESTAMPTZ NOT NULL,
    tx_hash         VARCHAR(64) NOT NULL,
    trader          VARCHAR(56) NOT NULL,
    token_in        VARCHAR(56) NOT NULL,
    token_out       VARCHAR(56) NOT NULL,
    amount_in       NUMERIC(30, 7) NOT NULL,
    amount_out      NUMERIC(30, 7) NOT NULL,
    fee_amount      NUMERIC(30, 7) NOT NULL,
    price_impact_bps INTEGER,
    reserve_a_after NUMERIC(30, 7) NOT NULL,
    reserve_b_after NUMERIC(30, 7) NOT NULL,
    CONSTRAINT swaps_dedup UNIQUE (tx_hash, pool_id)
);

CREATE INDEX IF NOT EXISTS idx_swaps_pool_ts   ON swaps(pool_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_swaps_trader    ON swaps(trader);
CREATE INDEX IF NOT EXISTS idx_swaps_ledger    ON swaps(ledger);

-- ── Liquidity Events ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS liquidity_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pool_id         UUID NOT NULL REFERENCES pools(id),
    ledger          BIGINT NOT NULL,
    ts              TIMESTAMPTZ NOT NULL,
    tx_hash         VARCHAR(64) NOT NULL,
    provider        VARCHAR(56) NOT NULL,
    event_type      VARCHAR(6) NOT NULL CHECK (event_type IN ('ADD', 'REMOVE')),
    amount_a        NUMERIC(30, 7) NOT NULL,
    amount_b        NUMERIC(30, 7) NOT NULL,
    shares_delta    NUMERIC(30, 7) NOT NULL,
    reserve_a_after NUMERIC(30, 7) NOT NULL,
    reserve_b_after NUMERIC(30, 7) NOT NULL,
    CONSTRAINT liq_events_dedup UNIQUE (tx_hash, pool_id)
);

CREATE INDEX IF NOT EXISTS idx_liq_events_pool_ts   ON liquidity_events(pool_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_liq_events_provider  ON liquidity_events(provider);

-- ── LP Positions ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lp_positions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pool_id         UUID NOT NULL REFERENCES pools(id),
    provider        VARCHAR(56) NOT NULL,
    shares          NUMERIC(30, 7) NOT NULL DEFAULT 0,
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (pool_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_lp_positions_provider ON lp_positions(provider);

-- ── Indexer State ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS indexer_state (
    key             VARCHAR(64) PRIMARY KEY,
    value           TEXT NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO indexer_state (key, value)
VALUES ('last_ledger', '0')
ON CONFLICT DO NOTHING;

-- ── Materialized Views ────────────────────────────────────────────────────────

-- 24h trading volume per pool
CREATE MATERIALIZED VIEW IF NOT EXISTS pool_volume_24h AS
SELECT
    pool_id,
    COUNT(*) AS swap_count,
    SUM(amount_in) AS volume_in,
    SUM(fee_amount) AS fees_collected,
    MIN(ts) AS window_start,
    MAX(ts) AS window_end
FROM swaps
WHERE ts > NOW() - INTERVAL '24 hours'
GROUP BY pool_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pool_volume_24h ON pool_volume_24h(pool_id);

-- 7d volume
CREATE MATERIALIZED VIEW IF NOT EXISTS pool_volume_7d AS
SELECT
    pool_id,
    COUNT(*) AS swap_count,
    SUM(amount_in) AS volume_in,
    SUM(fee_amount) AS fees_collected
FROM swaps
WHERE ts > NOW() - INTERVAL '7 days'
GROUP BY pool_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pool_volume_7d ON pool_volume_7d(pool_id);
