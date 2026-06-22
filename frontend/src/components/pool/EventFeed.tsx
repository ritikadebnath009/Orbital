"use client";
import { usePoolEvents } from "@/hooks/usePoolEvents";
import { POOLS, tokenSymbol } from "@/lib/stellar";
import { Activity, RefreshCw } from "lucide-react";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function EventFeed() {
  const addresses = POOLS.map((p) => p.address).filter(Boolean);
  const { events, loading, error, refetch } = usePoolEvents(addresses);

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4" style={{ color: "#b599e5" }} />
          <span className="text-sm font-semibold text-white">Live Activity</span>
          {loading && (
            <span
              className="w-1.5 h-1.5 rounded-full inline-block"
              style={{ background: "#b599e5", animation: "pulse 1s ease-in-out infinite" }}
            />
          )}
        </div>
        <button
          onClick={refetch}
          disabled={loading}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: "rgba(255,255,255,0.3)" }}
          onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.7)"; }}
          onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.3)"; }}
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" style={loading ? { animation: "spin 1s linear infinite" } : {}} />
        </button>
      </div>

      {error && (
        <div className="text-xs mb-3 p-2 rounded-lg" style={{ background: "rgba(255,92,122,0.08)", color: "#ff5c7a" }}>
          {error}
        </div>
      )}

      {events.length === 0 && !loading && (
        <div className="text-center py-6">
          <div className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
            No recent activity. Waiting for on-chain events…
          </div>
        </div>
      )}

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {events.map((ev) => {
          const pool = POOLS.find((p) => p.address === ev.poolAddress);
          const pair = pool ? `${pool.symbolA}/${pool.symbolB}` : ev.poolAddress.slice(0, 8) + "…";
          return (
            <div
              key={ev.id}
              className="flex items-center justify-between py-2.5 px-3 rounded-xl text-xs"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.04)" }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: ev.type === "swap" ? "#b599e5" : ev.type === "add_liq" ? "#4ade80" : "#fbbf24" }}
                />
                <span style={{ color: "rgba(255,255,255,0.55)" }}>
                  {ev.type === "swap" ? "Swap" : ev.type === "add_liq" ? "Add Liq" : "Remove Liq"}
                </span>
                <span className="font-medium text-white">{pair}</span>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${ev.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] transition-opacity hover:opacity-70"
                  style={{ color: "#6ee7ff" }}
                >
                  {ev.txHash.slice(0, 8)}…
                </a>
                <span style={{ color: "rgba(255,255,255,0.25)" }}>{timeAgo(ev.timestamp)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
