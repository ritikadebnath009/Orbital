"use client";
import { motion } from "framer-motion";
import { Activity, BarChart3, Layers, Percent } from "lucide-react";
import { useProtocolStats } from "@/hooks/useProtocolStats";
import { formatAmount } from "@/lib/stellar";

const TOKEN_COLORS: Record<string, string> = {
  USDC: "#4ade80",
  USDT: "#fbbf24",
  XLM: "#6ee7ff",
  EURC: "#b599e5",
};

function pairColor(symbolA: string): string {
  return TOKEN_COLORS[symbolA] ?? "#b599e5";
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

export function MarketSection() {
  const { loading, livePoolCount, pools, swaps24h, volume24h } = useProtocolStats();

  const avgFeeBps = pools.length
    ? pools.reduce((sum, p) => sum + p.feeBps, 0) / pools.length
    : null;

  // Pulled live from the deployed contracts — no fabricated $ figures. Swap
  // count/volume come from the optional backend indexer and show "—" rather
  // than an invented number when it isn't reachable.
  const stats = [
    { label: "Live Pools", value: loading ? "…" : String(livePoolCount), sub: "On Stellar Testnet", icon: Layers, color: "#6ee7ff" },
    { label: "Avg Fee", value: avgFeeBps === null ? "—" : `${(avgFeeBps / 100).toFixed(2)}%`, sub: "Across all pools", icon: Percent, color: "#b599e5" },
    { label: "24h Swaps", value: swaps24h === null ? "—" : String(swaps24h), sub: swaps24h === null ? "Indexer offline" : "Last 24 hours", icon: Activity, color: "#4ade80" },
    { label: "24h Volume", value: volume24h === null ? "—" : volume24h, sub: volume24h === null ? "Indexer offline" : "Across all pools", icon: BarChart3, color: "#fbbf24" },
  ];

  return (
    <section className="relative py-20 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Section header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#b599e5" }}>
            Live Market
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white">
            Real-time Pool Data
          </h2>
        </motion.div>

        {/* Stats row */}
        <motion.div
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          {stats.map((stat) => (
            <motion.div key={stat.label} variants={itemVariants}>
              <div
                className="glass-card rounded-2xl p-5 relative overflow-hidden group hover:scale-[1.02] transition-transform duration-300"
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"
                  style={{ background: `radial-gradient(ellipse at 50% 0%, ${stat.color}10 0%, transparent 70%)` }}
                />
                <div className="flex items-start justify-between mb-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: `${stat.color}15`, border: `1px solid ${stat.color}25` }}
                  >
                    <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
                  </div>
                </div>
                <div className="text-2xl font-bold text-white mb-0.5">{stat.value}</div>
                <div className="text-xs text-white/40">{stat.label}</div>
                <div className="text-xs mt-1" style={{ color: stat.color }}>{stat.sub}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Token table */}
        <motion.div
          className="glass-card rounded-2xl overflow-hidden"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div
            className="grid grid-cols-3 sm:grid-cols-4 px-6 py-3 text-xs font-semibold uppercase tracking-wider"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.3)" }}
          >
            <span>Pool</span>
            <span className="text-right">Reserves</span>
            <span className="text-right hidden sm:block">Virtual Price</span>
            <span className="text-right">Fee</span>
          </div>

          {loading && pools.length === 0 && (
            <div className="px-6 py-8 text-center text-sm text-white/35">
              Loading live pool data from Stellar Testnet…
            </div>
          )}
          {!loading && pools.length === 0 && (
            <div className="px-6 py-8 text-center text-sm text-white/35">
              No pools reachable right now — check your RPC connection.
            </div>
          )}

          {pools.map((pool, i) => (
            <motion.div
              key={pool.address}
              className="grid grid-cols-3 sm:grid-cols-4 px-6 py-4 items-center group cursor-pointer hover:bg-white/[0.02] transition-colors"
              style={{ borderBottom: i < pools.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                  style={{ background: `${pairColor(pool.symbolA)}25`, border: `1px solid ${pairColor(pool.symbolA)}40` }}
                >
                  {pool.symbolA[0]}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">
                    {pool.symbolA}/{pool.symbolB}
                  </div>
                  <div className="text-xs text-white/35 hidden sm:block">Live on Testnet</div>
                </div>
              </div>

              <div className="text-sm font-semibold text-white text-right tabular-nums">
                {formatAmount(pool.reserveA, 2)} {pool.symbolA}
                <div className="text-xs text-white/40">
                  {formatAmount(pool.reserveB, 2)} {pool.symbolB}
                </div>
              </div>

              <div className="text-sm text-white/50 text-right hidden sm:block tabular-nums">
                {formatAmount(pool.virtualPrice, 4)}
              </div>

              <div className="text-sm text-white/50 text-right tabular-nums">
                {(pool.feeBps / 100).toFixed(2)}%
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
