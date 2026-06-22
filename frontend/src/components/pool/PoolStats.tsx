"use client";
import { useEffect, useState } from "react";
import { TrendingUp, Droplets, Zap, Activity } from "lucide-react";
import { getReserves, getVirtualPrice, getAmp, getTotalShares, getFeeBps } from "@/lib/contract";
import { fromStrobes, POOLS } from "@/lib/stellar";

interface OnChainData {
  reserveA: bigint;
  reserveB: bigint;
  virtualPrice: bigint;
  feeBps: number;
  amp: bigint;
  totalShares: bigint;
}

interface BackendData {
  volume_24h?: string;
  fees_24h?: string;
  tvl_usd?: string;
}

function fmtTokens(strobes: bigint): string {
  const n = Number(fromStrobes(strobes));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(2);
}

function fmtUsd(strobes: bigint): string {
  return `$${fmtTokens(strobes)}`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-blue-500" />
        <span className="text-xs text-neutral-500 uppercase tracking-wide">{label}</span>
      </div>
      {loading ? (
        <div className="h-7 bg-neutral-800 rounded animate-pulse w-20" />
      ) : (
        <>
          <p className="text-xl font-semibold text-white">{value}</p>
          {sub && <p className="text-xs text-neutral-500 mt-1">{sub}</p>}
        </>
      )}
    </div>
  );
}

// Simple sparkline: 5 bars showing reserve balance over a simulated history
function ReserveBar({ a, b, symbolA, symbolB }: { a: bigint; b: bigint; symbolA: string; symbolB: string }) {
  const total = a + b;
  if (total === 0n) return null;
  const pct = Number((a * 10000n) / total) / 100;

  return (
    <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Droplets className="w-4 h-4 text-blue-500" />
        <span className="text-xs text-neutral-500 uppercase tracking-wide">Pool Composition</span>
      </div>
      <div className="flex rounded-full overflow-hidden h-3 mb-2">
        <div className="bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
        <div className="bg-purple-500 flex-1" />
      </div>
      <div className="flex justify-between text-xs text-neutral-400">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
          {symbolA} {pct.toFixed(1)}%
        </span>
        <span className="flex items-center gap-1">
          {symbolB} {(100 - pct).toFixed(1)}%
          <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
        </span>
      </div>
    </div>
  );
}

export function PoolStats({ poolAddress }: { poolAddress?: string }) {
  const [chain, setChain] = useState<OnChainData | null>(null);
  const [backend, setBackend] = useState<BackendData | null>(null);
  const [loading, setLoading] = useState(true);

  const poolConfig = POOLS.find((p) => p.address === poolAddress);

  useEffect(() => {
    if (!poolAddress) return;

    // On-chain data — always available
    Promise.all([
      getReserves(poolAddress),
      getVirtualPrice(poolAddress),
      getAmp(poolAddress),
      getTotalShares(poolAddress),
      getFeeBps(poolAddress),
    ])
      .then(([reserves, vp, amp, shares, feeBps]) => {
        setChain({
          reserveA: reserves[0],
          reserveB: reserves[1],
          virtualPrice: vp,
          amp,
          totalShares: shares,
          feeBps,
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    // Backend analytics — optional, fails gracefully
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (apiUrl) {
      fetch(`${apiUrl}/api/pools/${poolAddress}`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => data?.pool && setBackend(data.pool))
        .catch(() => {});
    }
  }, [poolAddress]);

  const symbolA = poolConfig?.symbolA ?? "A";
  const symbolB = poolConfig?.symbolB ?? "B";

  const tvl = chain ? chain.reserveA + chain.reserveB : 0n;
  // Fee APR estimate: (fee_bps / 10000) * 365 * (annual_turns). We don't have volume,
  // but if backend has it we compute fee_apy = (fees_24h * 365) / TVL.
  const feeApr =
    backend?.fees_24h && chain && tvl > 0n
      ? `${(
          (parseFloat(backend.fees_24h) * 365 * 100) /
          Number(fromStrobes(tvl))
        ).toFixed(2)}% APR`
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-white">
          {symbolA}/{symbolB} Pool
        </h3>
        {chain && (
          <>
            <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded-full">
              A = {chain.amp.toString()}
            </span>
            <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded-full">
              {(chain.feeBps / 100).toFixed(2)}% fee
            </span>
          </>
        )}
        {feeApr && (
          <span className="text-xs bg-green-900/40 text-green-400 border border-green-800 px-2 py-0.5 rounded-full">
            {feeApr}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={Droplets}
          label="TVL"
          value={chain ? fmtUsd(tvl) : "—"}
          sub={chain ? `${fmtTokens(chain.reserveA)} ${symbolA} + ${fmtTokens(chain.reserveB)} ${symbolB}` : undefined}
          loading={loading}
        />
        <StatCard
          icon={Zap}
          label="Volume 24h"
          value={backend?.volume_24h ? `$${parseFloat(backend.volume_24h).toFixed(2)}` : "—"}
          sub={backend?.fees_24h ? `Fees: $${parseFloat(backend.fees_24h).toFixed(2)}` : "Indexer required"}
          loading={loading}
        />
        <StatCard
          icon={TrendingUp}
          label="Virtual Price"
          value={chain ? (Number(fromStrobes(chain.virtualPrice))).toFixed(8) : "—"}
          sub="Per LP share (starts at 1.0)"
          loading={loading}
        />
        <StatCard
          icon={Activity}
          label="LP Shares"
          value={chain ? fmtTokens(chain.totalShares) : "—"}
          sub="Total outstanding"
          loading={loading}
        />
      </div>

      {chain && (
        <ReserveBar
          a={chain.reserveA}
          b={chain.reserveB}
          symbolA={symbolA}
          symbolB={symbolB}
        />
      )}
    </div>
  );
}
