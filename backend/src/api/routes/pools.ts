import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../../db/client";

export const poolsRouter = Router();

// GET /pools — list all pools with current stats
poolsRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const result = await db.query(`
      SELECT
        p.address,
        p.token_a,
        p.token_b,
        p.token_a_symbol,
        p.token_b_symbol,
        p.amp,
        p.fee_bps,
        p.is_paused,
        s.reserve_a,
        s.reserve_b,
        s.total_shares,
        s.virtual_price,
        s.tvl_usd,
        s.d,
        v24.swap_count AS swaps_24h,
        v24.volume_in AS volume_24h,
        v24.fees_collected AS fees_24h,
        v7.volume_in AS volume_7d
      FROM pools p
      LEFT JOIN LATERAL (
        SELECT * FROM pool_snapshots
        WHERE pool_id = p.id
        ORDER BY ts DESC
        LIMIT 1
      ) s ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS swap_count,
          COALESCE(SUM(amount_in), 0) AS volume_in,
          COALESCE(SUM(fee_amount), 0) AS fees_collected
        FROM swaps
        WHERE pool_id = p.id AND ts >= NOW() - INTERVAL '24 hours'
      ) v24 ON TRUE
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(amount_in), 0) AS volume_in
        FROM swaps
        WHERE pool_id = p.id AND ts >= NOW() - INTERVAL '7 days'
      ) v7 ON TRUE
      ORDER BY s.tvl_usd DESC NULLS LAST
    `);
    res.json({ pools: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /pools/:address — single pool detail
poolsRouter.get("/:address", async (req: Request, res: Response) => {
  const { address } = req.params;
  try {
    const pool = await db.query(
      "SELECT * FROM pools WHERE address = $1",
      [address]
    );
    if (pool.rowCount === 0) {
      return res.status(404).json({ error: "Pool not found" });
    }

    // Last 30 snapshots for sparkline
    const snapshots = await db.query(
      `SELECT ts, reserve_a, reserve_b, virtual_price, tvl_usd
       FROM pool_snapshots
       WHERE pool_id = (SELECT id FROM pools WHERE address = $1)
       ORDER BY ts DESC LIMIT 30`,
      [address]
    );

    return res.json({
      pool: pool.rows[0],
      snapshots: snapshots.rows.reverse(),
    });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /pools/:address/swaps — recent swaps
poolsRouter.get("/:address/swaps", async (req: Request, res: Response) => {
  const { address } = req.params;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const offset = parseInt(req.query.offset as string) || 0;

  try {
    const result = await db.query(
      `SELECT s.*
       FROM swaps s
       JOIN pools p ON p.id = s.pool_id
       WHERE p.address = $1
       ORDER BY s.ts DESC
       LIMIT $2 OFFSET $3`,
      [address, limit, offset]
    );
    res.json({ swaps: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /pools/:address/liquidity — recent liquidity events
poolsRouter.get("/:address/liquidity", async (req: Request, res: Response) => {
  const { address } = req.params;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

  try {
    const result = await db.query(
      `SELECT le.*
       FROM liquidity_events le
       JOIN pools p ON p.id = le.pool_id
       WHERE p.address = $1
       ORDER BY le.ts DESC
       LIMIT $2`,
      [address, limit]
    );
    res.json({ events: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /pools/:address/positions — LP positions in this pool
poolsRouter.get("/:address/positions", async (req: Request, res: Response) => {
  const { address } = req.params;

  try {
    const result = await db.query(
      `SELECT lp.provider, lp.shares,
              (lp.shares / NULLIF(s.total_shares, 0)) * 100 AS share_pct
       FROM lp_positions lp
       JOIN pools p ON p.id = lp.pool_id
       JOIN LATERAL (
         SELECT total_shares FROM pool_snapshots
         WHERE pool_id = p.id ORDER BY ts DESC LIMIT 1
       ) s ON TRUE
       WHERE p.address = $1 AND lp.shares > 0
       ORDER BY lp.shares DESC`,
      [address]
    );
    res.json({ positions: result.rows });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});
