import {
  rpc as SorobanRpc,
  Contract,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  scValToNative,
  Keypair,
} from "@stellar/stellar-sdk";
import { db } from "../db/client";

const STROBE = 10_000_000;

function getNetworkPassphrase(): string {
  const net = process.env.STELLAR_NETWORK;
  if (net === "mainnet") return Networks.PUBLIC;
  if (net === "futurenet") return Networks.FUTURENET;
  return Networks.TESTNET;
}

// Deterministic read-only keypair — never holds funds, only used for simulation source account
const DUMMY_KP = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 0x42));

function toDecimal(strobes: bigint): string {
  const whole = strobes / BigInt(STROBE);
  const frac = String(strobes % BigInt(STROBE)).padStart(7, "0");
  return `${whole}.${frac}`;
}

export class SnapshotWorker {
  private rpc: SorobanRpc.Server;
  private intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(rpcUrl: string, intervalMs = 5 * 60 * 1_000) {
    this.rpc = new SorobanRpc.Server(rpcUrl, { allowHttp: false });
    this.intervalMs = intervalMs;
  }

  async start() {
    console.log("[snapshot] Starting snapshot worker...");
    await this.cycle();
    this.timer = setInterval(() => {
      this.cycle().catch((err) => console.error("[snapshot] Cycle error:", err));
    }, this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async cycle() {
    const pools = await db.query<{ id: string; address: string }>(
      "SELECT id, address FROM pools WHERE is_paused = FALSE"
    );

    if (pools.rowCount === 0) return;

    const latestLedger = await this.rpc.getLatestLedger();

    for (const pool of pools.rows) {
      try {
        await this.snapshotPool(pool.id, pool.address, latestLedger.sequence);
      } catch (err) {
        console.error(`[snapshot] Failed for ${pool.address}:`, (err as Error).message);
      }
    }

    // Refresh materialized views after all snapshots
    await this.refreshViews();
    console.log(
      `[snapshot] ${pools.rowCount} pool(s) snapshotted at ledger ${latestLedger.sequence}`
    );
  }

  private async snapshotPool(poolId: string, address: string, ledger: number) {
    const [reservesRaw, vpRaw, sharesRaw, dRaw] = await Promise.all([
      this.sim(address, "get_reserves"),
      this.sim(address, "get_virtual_price"),
      this.sim(address, "get_total_shares"),
      this.sim(address, "get_d"),
    ]);

    const [reserveA, reserveB] = reservesRaw as [bigint, bigint];
    const virtualPrice = vpRaw as bigint;
    const totalShares = sharesRaw as bigint;
    const d = dRaw as bigint;

    await db.query(
      `INSERT INTO pool_snapshots
         (pool_id, ledger, ts, reserve_a, reserve_b, total_shares, virtual_price, d)
       VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7)`,
      [
        poolId,
        ledger,
        toDecimal(reserveA),
        toDecimal(reserveB),
        toDecimal(totalShares),
        toDecimal(virtualPrice),
        toDecimal(d),
      ]
    );
  }

  private async refreshViews() {
    // CONCURRENTLY allows reads during refresh; falls back to blocking refresh if it fails
    for (const view of ["pool_volume_24h", "pool_volume_7d"]) {
      await db
        .query(`REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`)
        .catch(() => db.query(`REFRESH MATERIALIZED VIEW ${view}`))
        .catch((err) =>
          console.error(`[snapshot] Failed to refresh ${view}:`, err.message)
        );
    }
  }

  private async sim(address: string, method: string): Promise<unknown> {
    const contract = new Contract(address);
    const tx = new TransactionBuilder(
      {
        accountId: () => DUMMY_KP.publicKey(),
        sequenceNumber: () => "0",
        incrementSequenceNumber: () => {},
      } as never,
      { fee: BASE_FEE, networkPassphrase: getNetworkPassphrase() }
    )
      .addOperation(contract.call(method))
      .setTimeout(30)
      .build();

    const sim = await this.rpc.simulateTransaction(tx);
    if (!SorobanRpc.Api.isSimulationSuccess(sim)) {
      const err = (sim as SorobanRpc.Api.SimulateTransactionErrorResponse).error;
      throw new Error(`sim(${method}) failed: ${err}`);
    }
    return scValToNative(sim.result!.retval);
  }
}
