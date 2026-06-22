/**
 * Registers pool addresses from POOL_ADDRESSES into the pools table.
 * Reads on-chain token/amp/fee data via Soroban RPC simulation.
 *
 * Usage: npm run db:seed
 */
import "dotenv/config";
import { Pool } from "pg";
import {
  rpc as SorobanRpc,
  Contract,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  scValToNative,
  Keypair,
} from "@stellar/stellar-sdk";

const RPC_URL = process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
const rpc = new SorobanRpc.Server(RPC_URL, { allowHttp: false });

// Throwaway keypair just for simulation — no real account needed
const DUMMY_KP = Keypair.random();

async function simGetter(address: string, method: string): Promise<unknown> {
  const contract = new Contract(address);
  const tx = new TransactionBuilder(
    { accountId: () => DUMMY_KP.publicKey(), sequenceNumber: () => "0", incrementSequenceNumber: () => {} } as never,
    { fee: BASE_FEE, networkPassphrase: Networks.TESTNET }
  )
    .addOperation(contract.call(method))
    .setTimeout(30)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (!SorobanRpc.Api.isSimulationSuccess(sim)) {
    throw new Error(`sim failed for ${method}: ${JSON.stringify((sim as SorobanRpc.Api.SimulateTransactionErrorResponse).error)}`);
  }
  return scValToNative(sim.result!.retval);
}

const KNOWN_SYMBOLS: Record<string, string> = {
  [process.env.USDC_ADDRESS ?? ""]: "USDC",
  [process.env.XLM_ADDRESS ?? ""]: "XLM",
};

function symbol(addr: string): string {
  return KNOWN_SYMBOLS[addr] ?? addr.slice(0, 8);
}

async function seed() {
  const addresses = (process.env.POOL_ADDRESSES ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);

  if (addresses.length === 0) {
    console.error("[seed] POOL_ADDRESSES not set — nothing to seed.");
    process.exit(1);
  }

  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  console.log(`[seed] Seeding ${addresses.length} pool(s)...`);

  for (const address of addresses) {
    try {
      const [tokens, amp, feeBps] = await Promise.all([
        simGetter(address, "get_tokens"),
        simGetter(address, "get_amp"),
        simGetter(address, "get_fee_bps"),
      ]);

      const [tokenA, tokenB] = tokens as [string, string];

      await db.query(
        `INSERT INTO pools (address, token_a, token_b, token_a_symbol, token_b_symbol, amp, fee_bps)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (address) DO UPDATE
         SET token_a=EXCLUDED.token_a, token_b=EXCLUDED.token_b,
             token_a_symbol=EXCLUDED.token_a_symbol, token_b_symbol=EXCLUDED.token_b_symbol,
             amp=EXCLUDED.amp, fee_bps=EXCLUDED.fee_bps`,
        [address, tokenA, tokenB, symbol(tokenA), symbol(tokenB), Number(amp), Number(feeBps)]
      );
      console.log(`[seed] ✓ ${address}  ${symbol(tokenA)}/${symbol(tokenB)}  A=${amp}  fee=${feeBps}bps`);
    } catch (err) {
      console.warn(`[seed] ✗ ${address}: ${(err as Error).message}`);
    }
  }

  await db.end();
  console.log("[seed] Done.");
}

seed().catch((err) => {
  console.error("[seed] Fatal:", err);
  process.exit(1);
});
