import "dotenv/config";
import { createApp } from "./api/server";
import { StellarEventIndexer } from "./indexer/stellar";
import { EventProcessor } from "./indexer/events";
import { PoolDiscovery } from "./indexer/discovery";
import { SnapshotWorker } from "./analytics/snapshots";
import { db } from "./db/client";

const PORT = parseInt(process.env.PORT || "4000");
const RPC_URL = process.env.STELLAR_RPC_URL || "https://soroban-testnet.stellar.org";
const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS;
const DISCOVERY_INTERVAL_MS = 30_000;

// Pool addresses from deployment (set via env or deployment.json)
function getPoolAddresses(): string[] {
  const addrs = process.env.POOL_ADDRESSES;
  if (!addrs) {
    console.warn("[main] POOL_ADDRESSES not set — no pools will be indexed");
    return [];
  }
  return addrs.split(",").map((a) => a.trim()).filter(Boolean);
}

async function main() {
  console.log("╔═══════════════════════════════════════╗");
  console.log("║  OrbitalDEX Backend — Starting         ║");
  console.log("╚═══════════════════════════════════════╝");
  console.log(`  RPC: ${RPC_URL}`);

  // Start HTTP server
  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`  API listening on :${PORT}`);
  });

  // Start indexer + snapshot worker — DB is optional; HTTP server stays up regardless
  const pools = getPoolAddresses();
  const snapshots = new SnapshotWorker(RPC_URL, 5 * 60 * 1_000); // every 5 min
  let processor: EventProcessor | null = null;
  let discoveryInterval: ReturnType<typeof setInterval> | null = null;

  if (pools.length > 0 || FACTORY_ADDRESS) {
    try {
      // knownPools may start empty if we're relying entirely on discovery —
      // PoolDiscovery.addPool()s into it as new pools turn up.
      const indexer = new StellarEventIndexer(RPC_URL, pools);
      processor = new EventProcessor(indexer);
      await processor.start(10_000); // poll every 10s
      console.log(`  Indexing ${pools.length} pool(s)`);

      if (FACTORY_ADDRESS) {
        // Auto-registers pools created after startup (e.g. via the
        // frontend's Create Pool flow) instead of requiring a manual
        // POOL_ADDRESSES update + restart every time.
        const discovery = new PoolDiscovery(RPC_URL, FACTORY_ADDRESS, indexer);
        const found = await discovery.discoverNewPools();
        if (found > 0) console.log(`  Discovered ${found} new pool(s) from factory`);
        discoveryInterval = setInterval(() => {
          discovery.discoverNewPools().catch((err) =>
            console.error("[discovery] Cycle error:", err)
          );
        }, DISCOVERY_INTERVAL_MS);
        console.log(`  Watching factory ${FACTORY_ADDRESS} for new pools`);
      }

      await snapshots.start();
    } catch (err) {
      console.warn("  [warn] Indexer/snapshots failed to start (DB unavailable?):", (err as Error).message);
      console.warn("  [warn] API server continues — analytics endpoints will return errors until DB is up.");
    }
  } else {
    console.warn("  No POOL_ADDRESSES or FACTORY_ADDRESS set — indexer and snapshots not started.");
    console.warn("  Run: npm run db:seed  to register pools from on-chain data.");
  }

  process.on("SIGTERM", () => {
    processor?.stop();
    if (discoveryInterval) clearInterval(discoveryInterval);
    snapshots.stop();
    server.close();
    db.end();
  });
}

main().catch((err) => {
  console.error("[main] Fatal:", err);
  process.exit(1);
});
