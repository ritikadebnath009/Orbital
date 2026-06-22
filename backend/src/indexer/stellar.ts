import {
  rpc as SorobanRpc,
  xdr,
  scValToNative,
} from "@stellar/stellar-sdk";

export interface PoolEvent {
  type: "swap" | "add_liq" | "rm_liq" | "pause" | "amp_upd";
  poolAddress: string;
  ledger: number;
  timestamp: Date;
  txHash: string;
  data: Record<string, unknown>;
}

export class StellarEventIndexer {
  private rpc: SorobanRpc.Server;
  private knownPools: Set<string>;

  constructor(rpcUrl: string, poolAddresses: string[]) {
    this.rpc = new SorobanRpc.Server(rpcUrl, { allowHttp: false });
    this.knownPools = new Set(poolAddresses);
  }

  addPool(address: string) {
    this.knownPools.add(address);
  }

  async getLatestLedger(): Promise<number> {
    const latest = await this.rpc.getLatestLedger();
    return latest.sequence;
  }

  // Fetch all contract events for known pools in a ledger range.
  async fetchEvents(
    startLedger: number,
    endLedger: number
  ): Promise<PoolEvent[]> {
    const events: PoolEvent[] = [];

    for (const poolAddress of this.knownPools) {
      try {
        const response = await this.rpc.getEvents({
          startLedger,
          filters: [
            {
              type: "contract",
              contractIds: [poolAddress],
            },
          ],
          limit: 200,
        });

        for (const event of response.events) {
          if (event.ledger > endLedger) continue;
          const parsed = this.parseEvent(event, poolAddress);
          if (parsed) events.push(parsed);
        }
      } catch (err) {
        console.error(`[indexer] Error fetching events for ${poolAddress}:`, err);
      }
    }

    return events.sort((a, b) => a.ledger - b.ledger);
  }

  private parseEvent(
    event: SorobanRpc.Api.EventResponse,
    poolAddress: string
  ): PoolEvent | null {
    try {
      const topics = event.topic.map((t) => scValToNative(t));
      const eventType = topics[0] as string;
      const actor = topics[1] as string;

      const rawData = scValToNative(event.value) as unknown[];

      const ledger = event.ledger;
      const timestamp = new Date(event.ledgerClosedAt);
      const txHash = event.txHash;

      switch (eventType) {
        case "swap": {
          const [tokenIn, tokenOut, amountIn, amountOut, fee, reserveA, reserveB] =
            rawData as [string, string, bigint, bigint, bigint, bigint, bigint];
          return {
            type: "swap",
            poolAddress,
            ledger,
            timestamp,
            txHash,
            data: {
              trader: actor,
              tokenIn,
              tokenOut,
              amountIn: amountIn.toString(),
              amountOut: amountOut.toString(),
              fee: fee.toString(),
              reserveA: reserveA.toString(),
              reserveB: reserveB.toString(),
            },
          };
        }

        case "add_liq": {
          const [amountA, amountB, sharesMinted, reserveA, reserveB] =
            rawData as [bigint, bigint, bigint, bigint, bigint];
          return {
            type: "add_liq",
            poolAddress,
            ledger,
            timestamp,
            txHash,
            data: {
              provider: actor,
              amountA: amountA.toString(),
              amountB: amountB.toString(),
              sharesMinted: sharesMinted.toString(),
              reserveA: reserveA.toString(),
              reserveB: reserveB.toString(),
            },
          };
        }

        case "rm_liq": {
          const [sharesBurned, amountA, amountB, reserveA, reserveB] =
            rawData as [bigint, bigint, bigint, bigint, bigint];
          return {
            type: "rm_liq",
            poolAddress,
            ledger,
            timestamp,
            txHash,
            data: {
              provider: actor,
              sharesBurned: sharesBurned.toString(),
              amountA: amountA.toString(),
              amountB: amountB.toString(),
              reserveA: reserveA.toString(),
              reserveB: reserveB.toString(),
            },
          };
        }

        default:
          return null;
      }
    } catch {
      return null;
    }
  }
}
