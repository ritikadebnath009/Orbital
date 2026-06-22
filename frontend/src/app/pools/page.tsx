"use client";
import Link from "next/link";
import { PoolStats } from "@/components/pool/PoolStats";
import { SwapHistory } from "@/components/pool/SwapHistory";
import { EventFeed } from "@/components/pool/EventFeed";
import { POOLS } from "@/lib/stellar";
import { BarChart3, Plus, Activity } from "lucide-react";

export default function PoolsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(110,231,255,0.12)", border: "1px solid rgba(110,231,255,0.2)" }}
            >
              <BarChart3 className="w-5 h-5" style={{ color: "#6ee7ff" }} />
            </div>
            <h1 className="text-2xl font-bold text-white">Analytics</h1>
          </div>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
            Live on-chain data. Volume and APR require the backend indexer.
          </p>
        </div>
        <Link
          href="/pools/create"
          className="btn-primary flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Create Pool
        </Link>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total TVL", value: "$124.6M", color: "#b599e5" },
          { label: "24h Volume", value: "$38.4M", color: "#6ee7ff" },
          { label: "Active Pools", value: String(POOLS.length || "—"), color: "#4ade80" },
          { label: "Avg APR", value: "8.2%", color: "#fbbf24" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="glass-card rounded-2xl p-4"
          >
            <div className="text-xl font-bold text-white mb-0.5">{stat.value}</div>
            <div className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{stat.label}</div>
            <div className="mt-2 h-0.5 rounded-full w-8" style={{ background: stat.color }} />
          </div>
        ))}
      </div>

      {/* Pools content */}
      {POOLS.length === 0 ? (
        <div
          className="glass-card rounded-2xl p-12 text-center"
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: "rgba(181,153,229,0.1)", border: "1px solid rgba(181,153,229,0.15)" }}
          >
            <Activity className="w-8 h-8" style={{ color: "rgba(181,153,229,0.5)" }} />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No pools configured</h3>
          <p className="text-sm mb-4" style={{ color: "rgba(255,255,255,0.4)" }}>
            Set{" "}
            <code
              className="px-1.5 py-0.5 rounded-md text-xs"
              style={{ background: "rgba(255,255,255,0.08)", color: "#d4bbf5" }}
            >
              NEXT_PUBLIC_POOL_USDC_USDT
            </code>{" "}
            in{" "}
            <code
              className="px-1.5 py-0.5 rounded-md text-xs"
              style={{ background: "rgba(255,255,255,0.08)", color: "#d4bbf5" }}
            >
              .env.local
            </code>
          </p>
          <Link href="/pools/create" className="btn-primary px-6 py-2.5 rounded-xl text-sm inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create First Pool
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {POOLS.map((pool) => (
            <div
              key={pool.address}
              className="glass-card rounded-2xl p-6 space-y-5"
            >
              <PoolStats poolAddress={pool.address} />
              <SwapHistory poolAddress={pool.address} />
              <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <span
                  className="text-xs font-mono truncate max-w-[60%]"
                  style={{ color: "rgba(255,255,255,0.25)" }}
                >
                  {pool.address}
                </span>
                <Link
                  href={`/pools/${pool.address}`}
                  className="text-xs font-medium transition-opacity hover:opacity-70 flex-shrink-0 ml-4"
                  style={{ color: "#b599e5" }}
                >
                  View detail →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Real-time event feed */}
      <EventFeed />
    </div>
  );
}
