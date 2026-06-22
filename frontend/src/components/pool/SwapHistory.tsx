"use client";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { tokenSymbol } from "@/lib/stellar";

interface SwapRow {
  ts: string;
  trader: string;
  token_in: string;
  token_out: string;
  amount_in: string;
  amount_out: string;
  fee_amount: string;
  price_impact_bps: number | null;
  tx_hash: string;
}

function fmt(strobes: string): string {
  const n = parseFloat(strobes);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(3)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(3)}K`;
  return n.toFixed(4);
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

function truncate(addr: string): string {
  return addr.slice(0, 4) + "…" + addr.slice(-4);
}

function SkeletonRow() {
  return (
    <tr>
      {[...Array(5)].map((_, i) => (
        <td key={i} className="px-3 py-2.5">
          <div className="h-3.5 bg-neutral-800 rounded animate-pulse" style={{ width: i === 0 ? 60 : i === 1 ? 80 : 100 }} />
        </td>
      ))}
    </tr>
  );
}

export function SwapHistory({ poolAddress }: { poolAddress: string }) {
  const [swaps, setSwaps] = useState<SwapRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      setUnavailable(true);
      setLoading(false);
      return;
    }

    fetch(`${apiUrl}/api/pools/${poolAddress}/swaps?limit=20`)
      .then((r) => {
        if (!r.ok) throw new Error("not ok");
        return r.json();
      })
      .then((data) => {
        setSwaps(data.swaps ?? []);
      })
      .catch(() => {
        setUnavailable(true);
      })
      .finally(() => setLoading(false));
  }, [poolAddress]);

  if (unavailable) {
    return (
      <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4 text-xs text-neutral-600 text-center">
        Swap history requires the backend indexer.{" "}
        <span className="text-neutral-500">
          Run <code className="text-neutral-400">npm run dev</code> in{" "}
          <code className="text-neutral-400">backend/</code>.
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-neutral-900 border border-neutral-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-300 uppercase tracking-wide">
          Recent Swaps
        </span>
        {swaps && swaps.length > 0 && (
          <span className="text-xs text-neutral-600">{swaps.length} shown</span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-neutral-800">
              <th className="px-3 py-2 text-left text-neutral-500 font-normal">Time</th>
              <th className="px-3 py-2 text-left text-neutral-500 font-normal">Trader</th>
              <th className="px-3 py-2 text-left text-neutral-500 font-normal">Swap</th>
              <th className="px-3 py-2 text-right text-neutral-500 font-normal">Amount In</th>
              <th className="px-3 py-2 text-right text-neutral-500 font-normal">Amount Out</th>
              <th className="px-3 py-2 text-right text-neutral-500 font-normal">Impact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800/50">
            {loading ? (
              [...Array(5)].map((_, i) => <SkeletonRow key={i} />)
            ) : !swaps || swaps.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-neutral-600">
                  No swaps yet.
                </td>
              </tr>
            ) : (
              swaps.map((s) => (
                <tr key={s.tx_hash} className="hover:bg-neutral-800/30 transition-colors">
                  <td className="px-3 py-2.5 text-neutral-500 whitespace-nowrap">
                    {fmtTime(s.ts)}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-neutral-400">
                    <a
                      href={`https://stellar.expert/explorer/testnet/account/${s.trader}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-white transition-colors"
                    >
                      {truncate(s.trader)}
                    </a>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1 text-neutral-300">
                      <span className="text-blue-400">{tokenSymbol(s.token_in)}</span>
                      <ArrowRight className="w-3 h-3 text-neutral-600" />
                      <span className="text-purple-400">{tokenSymbol(s.token_out)}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-neutral-300 tabular-nums">
                    {fmt(s.amount_in)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-green-400 tabular-nums">
                    {fmt(s.amount_out)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {s.price_impact_bps !== null ? (
                      <span className={s.price_impact_bps > 50 ? "text-red-400" : "text-neutral-400"}>
                        {(s.price_impact_bps / 100).toFixed(2)}%
                      </span>
                    ) : (
                      <span className="text-neutral-700">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
