"use client";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Activity, BarChart3 } from "lucide-react";

const MOCK_TOKENS = [
  { symbol: "XLM", name: "Stellar Lumens", price: "$0.1024", change: "+4.82%", volume: "$2.1M", positive: true, color: "#6ee7ff" },
  { symbol: "USDC", name: "USD Coin", price: "$1.0001", change: "+0.01%", volume: "$18.4M", positive: true, color: "#4ade80" },
  { symbol: "USDT", name: "Tether", price: "$0.9998", change: "-0.02%", volume: "$14.2M", positive: false, color: "#fbbf24" },
  { symbol: "EURC", name: "Euro Coin", price: "$1.0821", change: "+0.34%", volume: "$3.7M", positive: true, color: "#b599e5" },
];

const STATS = [
  { label: "24h Volume", value: "$38.4M", sub: "+12.4% vs yesterday", icon: BarChart3, color: "#b599e5" },
  { label: "Total TVL", value: "$124.6M", sub: "Across all pools", icon: Activity, color: "#6ee7ff" },
  { label: "Active Traders", value: "2,841", sub: "Last 24 hours", icon: TrendingUp, color: "#4ade80" },
  { label: "Total Swaps", value: "94,102", sub: "All-time", icon: Activity, color: "#fbbf24" },
];

function Sparkline({ positive }: { positive: boolean }) {
  const color = positive ? "#4ade80" : "#ff5c7a";
  const points = positive
    ? "0,20 10,16 20,18 30,12 40,14 50,8 60,10 70,4 80,6 90,2 100,4"
    : "0,4 10,8 20,6 30,12 40,10 50,16 60,14 70,18 80,16 90,20 100,18";

  return (
    <svg width="100" height="24" viewBox="0 0 100 24" fill="none">
      <defs>
        <linearGradient id={`sg-${positive}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline
        points={points}
        stroke={color}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
            Real-time Asset Data
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
          {STATS.map((stat) => (
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
            className="grid grid-cols-4 sm:grid-cols-5 px-6 py-3 text-xs font-semibold uppercase tracking-wider"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.3)" }}
          >
            <span>Token</span>
            <span className="text-right">Price</span>
            <span className="text-right hidden sm:block">24h Change</span>
            <span className="text-right hidden sm:block">Volume</span>
            <span className="text-right">Chart</span>
          </div>

          {MOCK_TOKENS.map((token, i) => (
            <motion.div
              key={token.symbol}
              className="grid grid-cols-4 sm:grid-cols-5 px-6 py-4 items-center group cursor-pointer hover:bg-white/[0.02] transition-colors"
              style={{ borderBottom: i < MOCK_TOKENS.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                  style={{ background: `${token.color}25`, border: `1px solid ${token.color}40` }}
                >
                  {token.symbol[0]}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">{token.symbol}</div>
                  <div className="text-xs text-white/35 hidden sm:block">{token.name}</div>
                </div>
              </div>

              <div className="text-sm font-semibold text-white text-right tabular-nums">
                {token.price}
              </div>

              <div
                className={`text-sm font-medium text-right hidden sm:flex items-center justify-end gap-1`}
                style={{ color: token.positive ? "#4ade80" : "#ff5c7a" }}
              >
                {token.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {token.change}
              </div>

              <div className="text-sm text-white/50 text-right hidden sm:block tabular-nums">
                {token.volume}
              </div>

              <div className="flex justify-end">
                <Sparkline positive={token.positive} />
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
