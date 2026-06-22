"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { useWallet } from "@/hooks/useWallet";
import {
  getFactoryAllPools,
  getUserShares,
  getReserves,
  getTotalShares,
} from "@/lib/contract";
import { FACTORY_ADDRESS, POOLS, tokenSymbol, fromStrobes } from "@/lib/stellar";

interface PositionData {
  poolAddress: string;
  symbolA: string;
  symbolB: string;
  tokenA: string;
  tokenB: string;
  userShares: bigint;
  totalShares: bigint;
  reserveA: bigint;
  reserveB: bigint;
}

function fmtTokens(strobes: bigint): string {
  const n = Number(fromStrobes(strobes));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(3)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(3)}K`;
  return n.toFixed(4);
}

function PositionCard({ pos }: { pos: PositionData }) {
  const share =
    pos.totalShares > 0n
      ? Number((pos.userShares * 10000n) / pos.totalShares) / 100
      : 0;
  const myA =
    pos.totalShares > 0n ? (pos.userShares * pos.reserveA) / pos.totalShares : 0n;
  const myB =
    pos.totalShares > 0n ? (pos.userShares * pos.reserveB) / pos.totalShares : 0n;
  const tvl = pos.reserveA + pos.reserveB;
  const myValue = myA + myB;

  return (
    <div className="rounded-2xl bg-neutral-950 border border-neutral-800 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white ring-2 ring-neutral-950">
              {pos.symbolA[0]}
            </div>
            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold text-white ring-2 ring-neutral-950">
              {pos.symbolB[0]}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">
              {pos.symbolA}/{pos.symbolB}
            </h3>
            <p className="text-xs text-neutral-500">StableSwap Pool</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-white">
            ${fmtTokens(myValue)}
          </p>
          <p className="text-xs text-neutral-500">Your value</p>
        </div>
      </div>

      {/* Position breakdown */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-3">
          <p className="text-xs text-neutral-500 mb-1">{pos.symbolA} deposited</p>
          <p className="text-base font-semibold text-white">{fmtTokens(myA)}</p>
        </div>
        <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-3">
          <p className="text-xs text-neutral-500 mb-1">{pos.symbolB} deposited</p>
          <p className="text-base font-semibold text-white">{fmtTokens(myB)}</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex justify-between text-xs text-neutral-400 pt-1 border-t border-neutral-800">
        <span>
          Pool share:{" "}
          <span className="text-white">{share.toFixed(4)}%</span>
        </span>
        <span>
          LP shares:{" "}
          <span className="text-white">{fmtTokens(pos.userShares)}</span>
        </span>
        <span>
          Pool TVL:{" "}
          <span className="text-white">${fmtTokens(tvl)}</span>
        </span>
      </div>

      {/* Action */}
      <Link href="/liquidity">
        <Button variant="secondary" className="w-full" size="sm">
          Manage Position
        </Button>
      </Link>
    </div>
  );
}

export default function PortfolioPage() {
  const { isConnected, connect, address } = useWallet();
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) return;
    setLoading(true);

    async function load() {
      // Discover pool list: try factory first, fall back to static POOLS
      let poolAddresses: string[] = [];
      if (FACTORY_ADDRESS) {
        try {
          poolAddresses = await getFactoryAllPools(FACTORY_ADDRESS);
        } catch {
          poolAddresses = POOLS.map((p) => p.address);
        }
      } else {
        poolAddresses = POOLS.map((p) => p.address);
      }

      const settled = await Promise.allSettled(
        poolAddresses.map(async (poolAddr): Promise<PositionData | null> => {
          const [shares, total, reserves] = await Promise.all([
            getUserShares(poolAddr, address!),
            getTotalShares(poolAddr),
            getReserves(poolAddr),
          ]);

          if (shares === 0n) return null;

          // Try to determine token symbols from static POOLS config or factory
          const staticPool = POOLS.find((p) => p.address === poolAddr);
          const symbolA = staticPool
            ? staticPool.symbolA
            : tokenSymbol(reserves[0].toString()); // fallback: just use address prefix
          const symbolB = staticPool ? staticPool.symbolB : tokenSymbol(reserves[1].toString());

          return {
            poolAddress: poolAddr,
            symbolA,
            symbolB,
            tokenA: staticPool?.tokenA ?? "",
            tokenB: staticPool?.tokenB ?? "",
            userShares: shares,
            totalShares: total,
            reserveA: reserves[0],
            reserveB: reserves[1],
          };
        })
      );

      const active = settled
        .filter((r): r is PromiseFulfilledResult<PositionData | null> => r.status === "fulfilled")
        .map((r) => r.value)
        .filter((v): v is PositionData => v !== null);

      setPositions(active);
      setLoading(false);
    }

    load().catch(() => setLoading(false));
  }, [address]);

  const totalValue = positions.reduce((sum, p) => {
    const myA = p.totalShares > 0n ? (p.userShares * p.reserveA) / p.totalShares : 0n;
    const myB = p.totalShares > 0n ? (p.userShares * p.reserveB) / p.totalShares : 0n;
    return sum + myA + myB;
  }, 0n);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white mb-1">Portfolio</h1>
        <p className="text-neutral-400 text-sm">
          Your LP positions across all OrbitalDEX pools.
        </p>
      </div>

      {!isConnected ? (
        <div className="rounded-2xl bg-neutral-950 border border-neutral-800 p-10 text-center space-y-4">
          <p className="text-neutral-400">Connect your wallet to view LP positions.</p>
          <Button onClick={connect}>Connect Wallet</Button>
        </div>
      ) : loading ? (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div
              key={i}
              className="rounded-2xl bg-neutral-950 border border-neutral-800 p-5 animate-pulse h-48"
            />
          ))}
        </div>
      ) : positions.length === 0 ? (
        <div className="rounded-2xl bg-neutral-950 border border-neutral-800 p-10 text-center space-y-4">
          <p className="text-neutral-400">No active LP positions found.</p>
          <Link href="/liquidity">
            <Button variant="secondary">Add Liquidity</Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Summary banner */}
          <div className="rounded-2xl bg-gradient-to-r from-blue-950 to-purple-950
                          border border-blue-800/40 p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-neutral-400 uppercase tracking-wide mb-1">
                Total Portfolio Value
              </p>
              <p className="text-3xl font-semibold text-white">${fmtTokens(totalValue)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-neutral-400 mb-1">Active positions</p>
              <p className="text-2xl font-semibold text-white">{positions.length}</p>
            </div>
          </div>

          {/* Position cards */}
          <div className="space-y-4">
            {positions.map((pos) => (
              <PositionCard key={pos.poolAddress} pos={pos} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
