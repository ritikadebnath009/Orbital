"use client";
import { use } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { PoolStats } from "@/components/pool/PoolStats";
import { SwapHistory } from "@/components/pool/SwapHistory";
import { POOLS, tokenSymbol } from "@/lib/stellar";
import { getPoolTokens } from "@/lib/contract";
import { useState, useEffect } from "react";

interface LpPosition {
  provider: string;
  shares: string;
  share_pct: string;
}

function truncate(addr: string) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function LpPositions({ poolAddress }: { poolAddress: string }) {
  const [positions, setPositions] = useState<LpPosition[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) { setUnavailable(true); return; }
    fetch(`${apiUrl}/api/pools/${poolAddress}/positions`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => setPositions(d.positions ?? []))
      .catch(() => setUnavailable(true));
  }, [poolAddress]);

  if (unavailable) return null;
  if (!positions) return (
    <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4 space-y-2">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-4 bg-neutral-800 rounded animate-pulse" />
      ))}
    </div>
  );
  if (positions.length === 0) return null;

  return (
    <div className="rounded-xl bg-neutral-900 border border-neutral-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-800">
        <span className="text-xs font-medium text-neutral-300 uppercase tracking-wide">
          Top LP Positions
        </span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-neutral-800">
            <th className="px-3 py-2 text-left text-neutral-500 font-normal">Provider</th>
            <th className="px-3 py-2 text-right text-neutral-500 font-normal">Shares</th>
            <th className="px-3 py-2 text-right text-neutral-500 font-normal">Pool %</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800/50">
          {positions.map((p) => (
            <tr key={p.provider} className="hover:bg-neutral-800/30 transition-colors">
              <td className="px-3 py-2.5 font-mono text-neutral-400">
                <a
                  href={`https://stellar.expert/explorer/testnet/account/${p.provider}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-white transition-colors"
                >
                  {truncate(p.provider)}
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </td>
              <td className="px-3 py-2.5 text-right text-neutral-300 tabular-nums">
                {parseFloat(p.shares).toFixed(4)}
              </td>
              <td className="px-3 py-2.5 text-right text-neutral-400 tabular-nums">
                {parseFloat(p.share_pct).toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PoolDetailPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = use(params);

  // Resolve symbol pair — from static config or on-chain lookup
  const staticPool = POOLS.find((p) => p.address === address);
  const [symbolA, setSymbolA] = useState(staticPool?.symbolA ?? "");
  const [symbolB, setSymbolB] = useState(staticPool?.symbolB ?? "");

  useEffect(() => {
    if (staticPool) return;
    getPoolTokens(address)
      .then(([tA, tB]) => {
        setSymbolA(tokenSymbol(tA));
        setSymbolB(tokenSymbol(tB));
      })
      .catch(() => {});
  }, [address, staticPool]);

  const pairLabel = symbolA && symbolB ? `${symbolA} / ${symbolB}` : address.slice(0, 8) + "…";

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Back nav */}
      <div className="flex items-center gap-3">
        <Link
          href="/pools"
          className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Analytics
        </Link>
        <span className="text-neutral-700">/</span>
        <span className="text-sm text-neutral-300">{pairLabel}</span>
      </div>

      {/* Pool header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold text-white">{pairLabel} Pool</h1>
        <a
          href={`https://stellar.expert/explorer/testnet/contract/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-white
                     bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 transition-colors"
        >
          <span className="font-mono">{address.slice(0, 10)}…</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {/* Stats */}
      <PoolStats poolAddress={address} />

      {/* Swap history */}
      <SwapHistory poolAddress={address} />

      {/* LP positions */}
      <LpPositions poolAddress={address} />
    </div>
  );
}
