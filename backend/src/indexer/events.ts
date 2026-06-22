import { db } from "../db/client";
import { StellarEventIndexer, PoolEvent } from "./stellar";

const STROBE = 10_000_000n;

function toDecimal(strobesStr: string): string {
  const negative = strobesStr.startsWith("-");
  const abs = BigInt(negative ? strobesStr.slice(1) : strobesStr);
  const whole = abs / STROBE;
  const frac = String(abs % STROBE).padStart(7, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

export class EventProcessor {
  private indexer: StellarEventIndexer;
  private processingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(indexer: StellarEventIndexer) {
    this.indexer = indexer;
  }

  async start(intervalMs = 10_000) {
    console.log("[processor] Starting event processor...");
    await this.processNewEvents();
    this.processingInterval = setInterval(() => {
      this.processNewEvents().catch((err) =>
        console.error("[processor] Cycle error:", err)
      );
    }, intervalMs);
  }

  stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  private async processNewEvents() {
    let lastLedger = await this.getLastProcessedLedger();
    const latestLedger = await this.indexer.getLatestLedger();

    // On a fresh DB (last_ledger=0) or if our cursor fell outside the RPC
    // retention window, fast-forward to the current tip so we only index
    // new events going forward.
    if (lastLedger === 0) {
      console.log(`[processor] Fresh start — fast-forwarding to ledger ${latestLedger}`);
      await this.setLastProcessedLedger(latestLedger);
      return;
    }

    if (latestLedger <= lastLedger) return;

    // Process in 100-ledger batches to stay within API limits
    const BATCH = 100;
    let from = lastLedger + 1;

    while (from <= latestLedger) {
      const to = Math.min(from + BATCH - 1, latestLedger);
      try {
        const events = await this.indexer.fetchEvents(from, to);
        if (events.length > 0) {
          await this.persistEvents(events);
          console.log(`[processor] Ledgers ${from}-${to}: ${events.length} events`);
        }
        await this.setLastProcessedLedger(to);
      } catch (err: unknown) {
        // RPC retention window error — advance cursor past the gap
        const msg = (err as { message?: string })?.message ?? String(err);
        const match = msg.match(/(\d+)\s*-\s*(\d+)/);
        if (match) {
          const minValid = parseInt(match[1]);
          console.warn(`[processor] Ledger ${from} outside RPC window — jumping to ${minValid}`);
          await this.setLastProcessedLedger(minValid - 1);
          from = minValid;
          continue;
        }
        throw err;
      }
      from = to + 1;
    }
  }

  private async persistEvents(events: PoolEvent[]) {
    await db.transaction(async (client) => {
      for (const event of events) {
        const poolRow = await client.query(
          "SELECT id FROM pools WHERE address = $1",
          [event.poolAddress]
        );
        if (poolRow.rowCount === 0) continue;
        const poolId = poolRow.rows[0].id;

        if (event.type === "swap") {
          const d = event.data;
          await client.query(
            `INSERT INTO swaps
              (pool_id, ledger, ts, tx_hash, trader, token_in, token_out,
               amount_in, amount_out, fee_amount, reserve_a_after, reserve_b_after)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             ON CONFLICT ON CONSTRAINT swaps_dedup DO NOTHING`,
            [
              poolId,
              event.ledger,
              event.timestamp,
              event.txHash,
              d.trader,
              d.tokenIn,
              d.tokenOut,
              toDecimal(d.amountIn as string),
              toDecimal(d.amountOut as string),
              toDecimal(d.fee as string),
              toDecimal(d.reserveA as string),
              toDecimal(d.reserveB as string),
            ]
          );
        }

        if (event.type === "add_liq" || event.type === "rm_liq") {
          const d = event.data;
          const eventType = event.type === "add_liq" ? "ADD" : "REMOVE";
          const sharesDelta =
            event.type === "add_liq"
              ? (d.sharesMinted as string)
              : `-${d.sharesBurned as string}`;

          await client.query(
            `INSERT INTO liquidity_events
              (pool_id, ledger, ts, tx_hash, provider, event_type,
               amount_a, amount_b, shares_delta, reserve_a_after, reserve_b_after)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             ON CONFLICT ON CONSTRAINT liq_events_dedup DO NOTHING`,
            [
              poolId,
              event.ledger,
              event.timestamp,
              event.txHash,
              d.provider,
              eventType,
              toDecimal(d.amountA as string),
              toDecimal(d.amountB as string),
              toDecimal(sharesDelta),
              toDecimal(d.reserveA as string),
              toDecimal(d.reserveB as string),
            ]
          );

          // Update LP position (shares_delta already in decimal)
          await client.query(
            `INSERT INTO lp_positions (pool_id, provider, shares, last_updated_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (pool_id, provider) DO UPDATE
             SET shares = lp_positions.shares + EXCLUDED.shares,
                 last_updated_at = EXCLUDED.last_updated_at`,
            [poolId, d.provider, toDecimal(sharesDelta), event.timestamp]
          );
        }
      }
    });
  }

  private async getLastProcessedLedger(): Promise<number> {
    const row = await db.query<{ value: string }>(
      "SELECT value FROM indexer_state WHERE key = 'last_ledger'"
    );
    return parseInt(row.rows[0]?.value ?? "0");
  }

  private async setLastProcessedLedger(ledger: number) {
    await db.query(
      `INSERT INTO indexer_state (key, value, updated_at)
       VALUES ('last_ledger', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [ledger.toString()]
    );
  }
}
