import { rpc as SorobanRpc, scValToNative } from "@stellar/stellar-sdk";
import { db } from "../db/client";
import { tokenSymbol } from "../lib/tokenSymbols";
import { StellarEventIndexer } from "./stellar";

/**
 * Watches the factory contract's `pool_new` events and registers any pool
 * the indexer doesn't already know about.
 *
 * Previously the only way a pool got indexed was a manual POOL_ADDRESSES env
 * var (filled in once by deploy_testnet.sh) plus `npm run db:seed` — a pool
 * created later through the frontend's "Create Pool" flow was invisible to
 * analytics/history until someone noticed, added it to the env var, and
 * restarted the backend. StellarEventIndexer.addPool() already existed for
 * exactly this but nothing ever called it.
 */
export class PoolDiscovery {
  private rpc: SorobanRpc.Server;

  constructor(
    rpcUrl: string,
    private factoryAddress: string,
    private indexer: StellarEventIndexer
  ) {
    this.rpc = new SorobanRpc.Server(rpcUrl, { allowHttp: false });
  }

  /** Returns the number of newly registered pools. */
  async discoverNewPools(): Promise<number> {
    const lastLedger = await this.getLastProcessedLedger();
    const latest = (await this.rpc.getLatestLedger()).sequence;

    if (lastLedger === 0) {
      // Fresh start — fast-forward to the tip rather than replaying the
      // factory's entire history, mirroring EventProcessor's own bootstrap.
      // Pools that existed before this ran are still covered by
      // POOL_ADDRESSES/db:seed; this only needs to catch new ones from here.
      await this.setLastProcessedLedger(latest);
      return 0;
    }
    if (latest <= lastLedger) return 0;

    let discovered = 0;
    try {
      const response = await this.rpc.getEvents({
        startLedger: lastLedger + 1,
        filters: [{ type: "contract", contractIds: [this.factoryAddress] }],
        limit: 200,
      });

      for (const event of response.events) {
        if (event.ledger > latest) continue;
        const topics = event.topic.map((t) => scValToNative(t));
        if (topics[0] !== "pool_new") continue;

        const [pool, tokenA, tokenB, amp, feeBps] = scValToNative(event.value) as [
          string,
          string,
          string,
          bigint,
          bigint,
        ];

        await db.query(
          `INSERT INTO pools (address, token_a, token_b, token_a_symbol, token_b_symbol, amp, fee_bps)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (address) DO NOTHING`,
          [pool, tokenA, tokenB, tokenSymbol(tokenA), tokenSymbol(tokenB), Number(amp), Number(feeBps)]
        );
        this.indexer.addPool(pool);
        discovered++;
        console.log(
          `[discovery] New pool registered: ${pool} (${tokenSymbol(tokenA)}/${tokenSymbol(tokenB)})`
        );
      }
    } catch (err) {
      // Same RPC-retention-window failure mode as the swap indexer — jump
      // the cursor forward rather than getting stuck retrying an
      // unreachable ledger range.
      const msg = (err as { message?: string })?.message ?? String(err);
      const match = msg.match(/(\d+)\s*-\s*(\d+)/);
      if (match) {
        await this.setLastProcessedLedger(parseInt(match[1]) - 1);
        return discovered;
      }
      throw err;
    }

    await this.setLastProcessedLedger(latest);
    return discovered;
  }

  private async getLastProcessedLedger(): Promise<number> {
    const row = await db.query<{ value: string }>(
      "SELECT value FROM indexer_state WHERE key = 'factory_last_ledger'"
    );
    return parseInt(row.rows[0]?.value ?? "0");
  }

  private async setLastProcessedLedger(ledger: number) {
    await db.query(
      `INSERT INTO indexer_state (key, value, updated_at)
       VALUES ('factory_last_ledger', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [ledger.toString()]
    );
  }
}
