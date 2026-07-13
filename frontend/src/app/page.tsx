"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { SwapCard } from "@/components/swap/SwapCard";
import { AuroraBackground } from "@/components/AuroraBackground";
import { ParticleField } from "@/components/ParticleField";
import { MarketSection } from "@/components/MarketSection";
import { FeaturesSection } from "@/components/FeaturesSection";
import { Footer } from "@/components/Footer";
import { ArrowRight, BarChart2, Zap, ChevronDown } from "lucide-react";
import { useProtocolStats } from "@/hooks/useProtocolStats";
import { GettingStarted } from "@/components/GettingStarted";

const TOKENS = [
  { symbol: "USDC", color: "#4ade80", letter: "U" },
  { symbol: "USDT", color: "#fbbf24", letter: "T" },
  { symbol: "XLM", color: "#6ee7ff", letter: "X" },
  { symbol: "EURC", color: "#b599e5", letter: "E" },
];

function FloatingTokens() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {TOKENS.map((token, i) => {
        const positions = [
          { top: "18%", left: "8%", delay: 0 },
          { top: "25%", right: "10%", delay: 1.2 },
          { bottom: "30%", left: "5%", delay: 0.6 },
          { bottom: "20%", right: "8%", delay: 1.8 },
        ];
        const pos = positions[i];
        return (
          <motion.div
            key={token.symbol}
            className="absolute"
            style={pos as React.CSSProperties}
            animate={{ y: [0, -14, 0], rotate: [0, 4, -4, 0] }}
            transition={{
              duration: 4 + i * 0.8,
              delay: pos.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-full"
              style={{
                background: "rgba(16,16,20,0.85)",
                border: `1px solid ${token.color}35`,
                backdropFilter: "blur(16px)",
                boxShadow: `0 4px 20px ${token.color}20`,
              }}
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                style={{ background: `${token.color}25`, border: `1px solid ${token.color}50` }}
              >
                {token.letter}
              </div>
              <span className="text-xs font-semibold text-white/80">{token.symbol}</span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function StatsTicker() {
  const { loading, livePoolCount, pools, swaps24h, volume24h } = useProtocolStats();

  const avgFeeBps = pools.length
    ? pools.reduce((sum, p) => sum + p.feeBps, 0) / pools.length
    : null;

  // Real numbers pulled live from the deployed contracts (and, when the
  // optional backend indexer is reachable, from actually-indexed swap
  // events) — no hardcoded marketing figures.
  const liveStats: { label: string; value: string }[] = [
    { label: "Network", value: "Stellar Testnet" },
    { label: "Live Pools", value: loading ? "…" : String(livePoolCount) },
    {
      label: "Avg Fee",
      value: avgFeeBps === null ? "—" : `${(avgFeeBps / 100).toFixed(2)}%`,
    },
    { label: "24h Swaps", value: swaps24h === null ? "—" : String(swaps24h) },
    { label: "24h Volume", value: volume24h === null ? "—" : volume24h },
  ];
  const items = [...liveStats, ...liveStats];
  return (
    <div className="w-full overflow-hidden py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <div className="flex animate-ticker gap-0 whitespace-nowrap" style={{ width: "max-content" }}>
        {items.map((stat, i) => (
          <div key={i} className="flex items-center gap-2 px-8">
            <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>
              {stat.label}
            </span>
            <span className="text-xs font-bold text-gradient-accent">{stat.value}</span>
            <span className="w-1 h-1 rounded-full" style={{ background: "rgba(181,153,229,0.3)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

const heroVariants = {
  hidden: { opacity: 0, y: 32 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
};

export default function Home() {
  return (
    <div className="relative" style={{ minHeight: "100vh" }}>
      {/* Fixed background layers */}
      <AuroraBackground />
      <ParticleField />

      {/* ── Hero ── */}
      <section className="relative" style={{ minHeight: "calc(100vh - 64px)", zIndex: 1 }}>
        <FloatingTokens />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-12">
          <GettingStarted />
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">

            {/* Left: copy */}
            <div className="flex-1 text-center lg:text-left max-w-2xl mx-auto lg:mx-0">
              {/* Badge */}
              <motion.div
                custom={0}
                variants={heroVariants}
                initial="hidden"
                animate="visible"
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-8"
                style={{
                  background: "rgba(181,153,229,0.1)",
                  border: "1px solid rgba(181,153,229,0.22)",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse" />
                <span className="text-xs font-semibold" style={{ color: "#b599e5" }}>
                  Now live on Stellar Testnet
                </span>
                <ArrowRight className="w-3 h-3" style={{ color: "#b599e5" }} />
              </motion.div>

              {/* Headline */}
              <motion.h1
                custom={0.1}
                variants={heroVariants}
                initial="hidden"
                animate="visible"
                className="text-5xl sm:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight mb-6"
              >
                <span className="text-white">Trade </span>
                <span className="text-gradient-hero">Instantly</span>
                <br />
                <span className="text-white">Across Chains</span>
              </motion.h1>

              {/* Subtext */}
              <motion.p
                custom={0.2}
                variants={heroVariants}
                initial="hidden"
                animate="visible"
                className="text-lg leading-relaxed mb-10 max-w-lg lg:max-w-none"
                style={{ color: "rgba(255,255,255,0.45)" }}
              >
                Curve-inspired StableSwap on Stellar Soroban. Near-zero slippage on
                stablecoin pairs with institutional-grade execution.
              </motion.p>

              {/* CTAs */}
              <motion.div
                custom={0.3}
                variants={heroVariants}
                initial="hidden"
                animate="visible"
                className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start"
              >
                <a
                  href="#swap"
                  className="btn-primary px-7 py-3.5 rounded-xl text-[15px] inline-flex items-center justify-center gap-2 group"
                >
                  <Zap className="w-4 h-4" />
                  Launch App
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </a>
                <Link
                  href="/pools"
                  className="btn-secondary px-7 py-3.5 rounded-xl text-[15px] inline-flex items-center justify-center gap-2"
                >
                  <BarChart2 className="w-4 h-4" />
                  View Analytics
                </Link>
              </motion.div>

              {/* Feature pills */}
              <motion.div
                custom={0.4}
                variants={heroVariants}
                initial="hidden"
                animate="visible"
                className="flex flex-wrap gap-2 mt-10 justify-center lg:justify-start"
              >
                {["0.04% Fee", "A=100 Amplification", "Non-custodial", "5s Finality"].map((pill) => (
                  <span
                    key={pill}
                    className="px-3 py-1.5 rounded-full text-xs font-medium"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      color: "rgba(255,255,255,0.5)",
                    }}
                  >
                    {pill}
                  </span>
                ))}
              </motion.div>
            </div>

            {/* Right: Swap card */}
            <motion.div
              id="swap"
              className="w-full max-w-[420px] flex-shrink-0"
              initial={{ opacity: 0, scale: 0.95, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <SwapCard />
            </motion.div>
          </div>

          {/* Scroll indicator */}
          <motion.div
            className="hidden lg:flex flex-col items-center mt-16 gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
          >
            <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.2)" }}>
              Scroll to explore
            </span>
            <motion.div
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <ChevronDown className="w-4 h-4" style={{ color: "rgba(255,255,255,0.2)" }} />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Stats ticker */}
      <div className="relative" style={{ zIndex: 1 }}>
        <StatsTicker />
      </div>

      {/* ── Market section ── */}
      <div className="relative" style={{ zIndex: 1 }}>
        <MarketSection />
      </div>

      {/* ── Features section ── */}
      <div className="relative" style={{ zIndex: 1 }}>
        <FeaturesSection />
      </div>

      {/* ── CTA Banner ── */}
      <div className="relative px-4 py-16" style={{ zIndex: 1 }}>
        <div className="max-w-4xl mx-auto">
          <motion.div
            className="glass-card rounded-3xl p-10 sm:p-14 text-center relative overflow-hidden"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            {/* Glow */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: "radial-gradient(ellipse at 50% 0%, rgba(181,153,229,0.12) 0%, transparent 65%)",
              }}
            />
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-px"
              style={{ background: "linear-gradient(90deg, transparent, rgba(181,153,229,0.6), transparent)" }}
            />

            <motion.div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
              style={{ background: "linear-gradient(135deg, #b599e5, #8b5cf6, #6ee7ff)" }}
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <Zap className="w-8 h-8 text-white fill-white" />
            </motion.div>

            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Ready to trade?
            </h2>
            <p className="mb-8 text-base max-w-md mx-auto" style={{ color: "rgba(255,255,255,0.45)" }}>
              Connect your Stellar wallet and start swapping with near-zero slippage in seconds.
            </p>

            <a
              href="#swap"
              className="btn-primary inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base"
              onClick={(e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <Zap className="w-4 h-4 fill-white" />
              Start Trading
              <ArrowRight className="w-4 h-4" />
            </a>
          </motion.div>
        </div>
      </div>

      {/* Footer */}
      <div className="relative" style={{ zIndex: 1 }}>
        <Footer />
      </div>
    </div>
  );
}
