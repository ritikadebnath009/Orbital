"use client";
import { useState, useEffect } from "react";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useWallet } from "@/hooks/useWallet";
import { tokenSymbol, POOLS } from "@/lib/stellar";

interface SwapEvent {
  ts: string;
  pool_address?: string;
  token_in: string;
  token_out: string;
  amount_in: string;
  amount_out: string;
  fee_amount: string;
  tx_hash: string;
}

interface LiquidityEvent {
  ts: string;
  pool_address?: string;
  event_type: "ADD" | "REMOVE";
  amount_a: string;
  amount_b: string;
  shares_delta: string;
  tx_hash: string;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmt(s: string) {
  const n = parseFloat(s);
  return n >= 1000 ? `${(n / 1000).toFixed(3)}K` : n.toFixed(4);
}

function poolLabel(addr?: string) {
  if (!addr) return "—";
  const p = POOLS.find((p) => p.address === addr);
  return p ? `${p.symbolA}/${p.symbolB}` : addr.slice(0, 8) + "…";
}

function TxLink({ hash }: { hash: string }) {
  return (
    <a
      href={`https://stellar.expert/explorer/testnet/tx/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 text-neutral-500 hover:text-white transition-colors font-mono text-xs"
    >
      {hash.slice(0, 8)}…
      <ExternalLink className="w-2.5 h-2.5" />
    </a>
  );
}

export default function HistoryPage() {
  const { isConnected, connect, address } = useWallet();
  const [swaps, setSwaps] = useState<SwapEvent[]>([]);
  const [liqEvents, setLiqEvents] = useState<LiquidityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [tab, setTab] = useState<"swaps" | "liquidity">("swaps");

  useEffect(() => {
    if (!address) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) { setUnavailable(true); return; }

    setLoading(true);
    Promise.all([
      fetch(`${apiUrl}/api/history/${address}/swaps`).then((r) => r.ok ? r.json() : { swaps: [] }),
      fetch(`${apiUrl}/api/history/${address}/liquidity`).then((r) => r.ok ? r.json() : { events: [] }),
    ])
      .then(([s, l]) => {
        setSwaps(s.swaps ?? []);
        setLiqEvents(l.events ?? []);
      })
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false));
  }, [address]);

  if (!isConnected) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="text-2xl font-semibold text-white">Transaction History</h1>
        <p className="text-neutral-400 text-sm">Connect your wallet to see your swap and liquidity history.</p>
        <Button onClick={connect} size="lg">Connect Wallet</Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white mb-1">Transaction History</h1>
        <p className="text-neutral-500 text-xs font-mono break-all">{address}</p>
      </div>

      {unavailable && (
        <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-4 text-sm text-neutral-500 text-center">
          History requires the backend indexer.{" "}
          <span className="text-neutral-400">Run <code>npm run dev</code> in <code>backend/</code>.</span>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 bg-neutral-900 rounded-lg p-0.5 w-fit">
        {(["swaps", "liquidity"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
              tab === t ? "bg-neutral-700 text-white" : "text-neutral-500 hover:text-white"
            }`}
          >
            {t === "swaps" ? `Swaps (${swaps.length})` : `Liquidity (${liqEvents.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-neutral-900 border border-neutral-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : tab === "swaps" ? (
        <div className="rounded-xl bg-neutral-900 border border-neutral-800 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="px-3 py-2 text-left text-neutral-500 font-normal">Time</th>
                <th className="px-3 py-2 text-left text-neutral-500 font-normal">Pool</th>
                <th className="px-3 py-2 text-left text-neutral-500 font-normal">Swap</th>
                <th className="px-3 py-2 text-right text-neutral-500 font-normal">In</th>
                <th className="px-3 py-2 text-right text-neutral-500 font-normal">Out</th>
                <th className="px-3 py-2 text-right text-neutral-500 font-normal">Tx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {swaps.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-neutral-600">No swaps found.</td></tr>
              ) : swaps.map((s) => (
                <tr key={s.tx_hash} className="hover:bg-neutral-800/30 transition-colors">
                  <td className="px-3 py-2.5 text-neutral-500 whitespace-nowrap">{fmtTime(s.ts)}</td>
                  <td className="px-3 py-2.5 text-neutral-400">{poolLabel(s.pool_address)}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex items-center gap-1">
                      <span className="text-blue-400">{tokenSymbol(s.token_in)}</span>
                      <ArrowRight className="w-3 h-3 text-neutral-600" />
                      <span className="text-purple-400">{tokenSymbol(s.token_out)}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-neutral-300 tabular-nums">{fmt(s.amount_in)}</td>
                  <td className="px-3 py-2.5 text-right text-green-400 tabular-nums">{fmt(s.amount_out)}</td>
                  <td className="px-3 py-2.5 text-right"><TxLink hash={s.tx_hash} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl bg-neutral-900 border border-neutral-800 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="px-3 py-2 text-left text-neutral-500 font-normal">Time</th>
                <th className="px-3 py-2 text-left text-neutral-500 font-normal">Pool</th>
                <th className="px-3 py-2 text-left text-neutral-500 font-normal">Action</th>
                <th className="px-3 py-2 text-right text-neutral-500 font-normal">Token A</th>
                <th className="px-3 py-2 text-right text-neutral-500 font-normal">Token B</th>
                <th className="px-3 py-2 text-right text-neutral-500 font-normal">Tx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {liqEvents.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-neutral-600">No liquidity events found.</td></tr>
              ) : liqEvents.map((e) => (
                <tr key={e.tx_hash} className="hover:bg-neutral-800/30 transition-colors">
                  <td className="px-3 py-2.5 text-neutral-500 whitespace-nowrap">{fmtTime(e.ts)}</td>
                  <td className="px-3 py-2.5 text-neutral-400">{poolLabel(e.pool_address)}</td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      e.event_type === "ADD"
                        ? "bg-green-900/40 text-green-400 border border-green-800"
                        : "bg-red-900/30 text-red-400 border border-red-800"
                    }`}>
                      {e.event_type === "ADD" ? "+ Add" : "− Remove"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-neutral-300 tabular-nums">{fmt(e.amount_a)}</td>
                  <td className="px-3 py-2.5 text-right text-neutral-300 tabular-nums">{fmt(e.amount_b)}</td>
                  <td className="px-3 py-2.5 text-right"><TxLink hash={e.tx_hash} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
