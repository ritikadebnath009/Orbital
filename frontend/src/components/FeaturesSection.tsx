"use client";
import { motion } from "framer-motion";
import { Shield, Zap, GitBranch, Layers, Lock, TrendingUp } from "lucide-react";

const FEATURES = [
  {
    icon: Zap,
    title: "Lightning Execution",
    desc: "Sub-second settlement on Stellar. 5-second finality, always.",
    color: "#6ee7ff",
    delay: 0,
  },
  {
    icon: Shield,
    title: "MEV Protection",
    desc: "Slippage controls and minimum received guarantees protect every trade.",
    color: "#b599e5",
    delay: 0.08,
  },
  {
    icon: GitBranch,
    title: "Smart Routing",
    desc: "Multi-hop pathfinding finds the optimal route across all liquidity pools.",
    color: "#a78bfa",
    delay: 0.16,
  },
  {
    icon: Layers,
    title: "Deep Liquidity",
    desc: "Curve's StableSwap invariant provides minimal slippage on stablecoin pairs.",
    color: "#4ade80",
    delay: 0.24,
  },
  {
    icon: Lock,
    title: "Non-Custodial",
    desc: "Your keys, your assets. Smart contracts enforce all rules on-chain.",
    color: "#fbbf24",
    delay: 0.32,
  },
  {
    icon: TrendingUp,
    title: "Earn Fees",
    desc: "Liquidity providers earn 0.04% on every swap. Compounding in real-time.",
    color: "#fb7185",
    delay: 0.40,
  },
];

export function FeaturesSection() {
  return (
    <section className="relative py-24 px-4">
      {/* Background accent */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 50%, rgba(181,153,229,0.04) 0%, transparent 70%)",
        }}
      />

      <div className="max-w-7xl mx-auto relative">
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#6ee7ff" }}>
            Why OrbitalDEX
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Built for{" "}
            <span className="text-gradient-accent">serious traders</span>
          </h2>
          <p className="text-white/45 text-base max-w-xl mx-auto leading-relaxed">
            Every feature is designed around one goal: the best possible swap experience on Stellar.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: f.delay }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
            >
              <div
                className="glass-card rounded-2xl p-6 h-full relative overflow-hidden group cursor-default"
              >
                {/* Hover glow */}
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"
                  style={{
                    background: `radial-gradient(ellipse at 30% 30%, ${f.color}0d 0%, transparent 65%)`,
                  }}
                />

                {/* Icon */}
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center mb-5 relative"
                  style={{
                    background: `${f.color}12`,
                    border: `1px solid ${f.color}22`,
                  }}
                >
                  <f.icon className="w-5 h-5" style={{ color: f.color }} />
                  {/* Icon glow on hover */}
                  <div
                    className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{ boxShadow: `0 0 16px ${f.color}40` }}
                  />
                </div>

                <h3 className="text-base font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.42)" }}>
                  {f.desc}
                </p>

                {/* Bottom accent line */}
                <div
                  className="absolute bottom-0 left-6 right-6 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: `linear-gradient(90deg, transparent, ${f.color}50, transparent)` }}
                />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
