import { Router, Request, Response } from "express";
import { db } from "../../db/client";

export const historyRouter = Router();

// GET /history/:trader/swaps — all swaps by a wallet address across all pools
historyRouter.get("/:trader/swaps", async (req: Request, res: Response) => {
  const { trader } = req.params;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  const offset = parseInt(req.query.offset as string) || 0;

  try {
    const result = await db.query(
      `SELECT s.*, p.address AS pool_address, p.token_a_symbol, p.token_b_symbol
       FROM swaps s
       JOIN pools p ON p.id = s.pool_id
       WHERE s.trader = $1
       ORDER BY s.ts DESC
       LIMIT $2 OFFSET $3`,
      [trader, limit, offset]
    );
    res.json({ swaps: result.rows });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /history/:trader/liquidity — all liquidity events by a wallet address
historyRouter.get("/:trader/liquidity", async (req: Request, res: Response) => {
  const { trader } = req.params;
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
  const offset = parseInt(req.query.offset as string) || 0;

  try {
    const result = await db.query(
      `SELECT le.*, p.address AS pool_address, p.token_a_symbol, p.token_b_symbol
       FROM liquidity_events le
       JOIN pools p ON p.id = le.pool_id
       WHERE le.provider = $1
       ORDER BY le.ts DESC
       LIMIT $2 OFFSET $3`,
      [trader, limit, offset]
    );
    res.json({ events: result.rows });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /history/:trader/positions — current LP positions across all pools
historyRouter.get("/:trader/positions", async (req: Request, res: Response) => {
  const { trader } = req.params;

  try {
    const result = await db.query(
      `SELECT
         p.address AS pool_address,
         p.token_a_symbol,
         p.token_b_symbol,
         lp.shares,
         (lp.shares / NULLIF(snap.total_shares, 0)) * 100 AS share_pct,
         snap.reserve_a * (lp.shares / NULLIF(snap.total_shares, 0)) AS est_token_a,
         snap.reserve_b * (lp.shares / NULLIF(snap.total_shares, 0)) AS est_token_b,
         lp.last_updated_at
       FROM lp_positions lp
       JOIN pools p ON p.id = lp.pool_id
       LEFT JOIN LATERAL (
         SELECT total_shares, reserve_a, reserve_b
         FROM pool_snapshots
         WHERE pool_id = p.id
         ORDER BY ts DESC LIMIT 1
       ) snap ON TRUE
       WHERE lp.provider = $1 AND lp.shares > 0
       ORDER BY lp.shares DESC`,
      [trader]
    );
    res.json({ positions: result.rows });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});
