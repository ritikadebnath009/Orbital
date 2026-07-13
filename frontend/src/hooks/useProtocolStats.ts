"use client";
import { useState, useEffect } from "react";
import { POOLS, fromStrobes } from "@/lib/stellar";
import { getReserves, getVirtualPrice, getFeeBps } from "@/lib/contract";

export interface LivePoolStat {
  address: string;
  symbolA: string;
  symbolB: string;
  reserveA: bigint;
  reserveB: bigint;
  virtualPrice: bigint;
  feeBps: number;
}

export interface ProtocolStats {
  loading: boolean;
  livePoolCount: number;
  pools: LivePoolStat[];
  swaps24h: number | null; // null when the (optional) backend indexer isn't reachable
  volume24h: string | null;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL;

/**
 * Pulls real numbers straight from the deployed contracts (reserves, virtual
 * price, fee) instead of hardcoded marketing figures. Swap-count/volume come
 * from the backend indexer when it's reachable — since that service is
 * optional (see README), those two fields stay `null` rather than falling
 * back to invented data when it isn't running.
 */
export function useProtocolStats(): ProtocolStats {
  const [pools, setPools] = useState<LivePoolStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [swaps24h, setSwaps24h] = useState<number | null>(null);
  const [volume24h, setVolume24h] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOnChain() {
      const results = await Promise.all(
        POOLS.map(async (p) => {
          try {
            const [reserves, virtualPrice, feeBps] = await Promise.all([
              getReserves(p.address),
              getVirtualPrice(p.address),
              getFeeBps(p.address),
            ]);
            const stat: LivePoolStat = {
              address: p.address,
              symbolA: p.symbolA,
              symbolB: p.symbolB,
              reserveA: reserves[0],
              reserveB: reserves[1],
              virtualPrice,
              feeBps,
            };
            return stat;
          } catch {
            return null;
          }
        })
      );
      if (!cancelled) {
        setPools(results.filter((r): r is LivePoolStat => r !== null));
        setLoading(false);
      }
    }

    async function loadIndexerStats() {
      if (!API_URL) return;
      try {
        const res = await fetch(`${API_URL}/api/pools`, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) return;
        const body = await res.json();
        const rows: Array<{ swaps_24h?: string | number; volume_24h?: string | number }> =
          body?.pools ?? [];
        if (rows.length === 0 || cancelled) return;
        const totalSwaps = rows.reduce((sum, r) => sum + Number(r.swaps_24h ?? 0), 0);
        const totalVolume = rows.reduce((sum, r) => sum + Number(r.volume_24h ?? 0), 0);
        setSwaps24h(totalSwaps);
        setVolume24h(fromStrobes(BigInt(Math.round(totalVolume))));
      } catch {
        // Backend indexer not running — leave swaps24h/volume24h as null so
        // the UI can honestly show "—" instead of a fabricated number.
      }
    }

    loadOnChain();
    loadIndexerStats();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    loading,
    livePoolCount: pools.length,
    pools,
    swaps24h,
    volume24h,
  };
}
