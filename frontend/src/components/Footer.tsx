"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { Zap, GitBranch, Share2, MessageCircle, ExternalLink } from "lucide-react";

interface FooterLink { label: string; href: string; external?: boolean; }
const LINKS: Record<string, FooterLink[]> = {
  Product: [
    { label: "Swap", href: "/" },
    { label: "Liquidity", href: "/liquidity" },
    { label: "Analytics", href: "/pools" },
    { label: "Portfolio", href: "/portfolio" },
  ],
  Resources: [
    { label: "Documentation", href: "#", external: true },
    { label: "Smart Contracts", href: "#", external: true },
    { label: "Audit Report", href: "/auditreport.md", external: true },
    { label: "Stellar Network", href: "https://stellar.org", external: true },
  ],
  Community: [
    { label: "Twitter / X", href: "#", external: true },
    { label: "Discord", href: "#", external: true },
    { label: "Telegram", href: "#", external: true },
    { label: "GitHub", href: "#", external: true },
  ],
};

export function Footer() {
  return (
    <footer
      className="relative mt-24 border-t"
      style={{ borderColor: "rgba(255,255,255,0.05)", background: "rgba(10,10,14,0.8)" }}
    >
      {/* Top glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(181,153,229,0.4), transparent)" }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-16 pb-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-10 mb-14">
          {/* Brand */}
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5 mb-5">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #b599e5, #8b5cf6, #6ee7ff)" }}
              >
                <Zap className="w-4 h-4 text-white fill-white" />
              </div>
              <span className="font-bold text-white text-[15px]">OrbitalDEX</span>
            </div>
            <p className="text-sm leading-relaxed mb-6" style={{ color: "rgba(255,255,255,0.38)" }}>
              Premium StableSwap DEX on Stellar Soroban.<br />
              Near-zero slippage for stablecoin traders.
            </p>
            <div className="flex items-center gap-3">
              {[
                { Icon: GitBranch, href: "#" },
                { Icon: Share2, href: "#" },
                { Icon: MessageCircle, href: "#" },
              ].map(({ Icon, href }, i) => (
                <a
                  key={i}
                  href={href}
                  className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 hover:scale-110"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.45)",
                  }}
                  onMouseOver={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(181,153,229,0.12)";
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(181,153,229,0.25)";
                    (e.currentTarget as HTMLElement).style.color = "#b599e5";
                  }}
                  onMouseOut={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                    (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)";
                    (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.45)";
                  }}
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          {Object.entries(LINKS).map(([category, items]) => (
            <div key={category}>
              <div
                className="text-xs font-semibold uppercase tracking-widest mb-4"
                style={{ color: "rgba(255,255,255,0.3)" }}
              >
                {category}
              </div>
              <ul className="space-y-3">
                {items.map(({ label, href, external }) => (
                  <li key={label}>
                    <Link
                      href={href}
                      target={external ? "_blank" : undefined}
                      className="text-sm flex items-center gap-1.5 transition-colors duration-150 group"
                      style={{ color: "rgba(255,255,255,0.42)" }}
                    >
                      <span className="group-hover:text-white transition-colors">{label}</span>
                      {external && (
                        <ExternalLink
                          className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity"
                          style={{ color: "#b599e5" }}
                        />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div
          className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-8"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
        >
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
            © 2025 OrbitalDEX. All rights reserved. Testnet — not financial advice.
          </p>
          <div className="flex items-center gap-4 text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
            <span>Built on Stellar Soroban</span>
            <span>·</span>
            <span className="text-gradient-accent font-medium">v0.1.0-beta</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
