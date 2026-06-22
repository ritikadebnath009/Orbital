"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/hooks/useWallet";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Zap, ChevronDown } from "lucide-react";

const NAV_LINKS = [
  { href: "/", label: "Swap" },
  { href: "/liquidity", label: "Liquidity" },
  { href: "/pools", label: "Analytics" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/history", label: "History" },
];

function truncate(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function NavBar() {
  const pathname = usePathname();
  const { isConnected, address, connect, disconnect, isLoading } = useWallet();

  return (
    <nav
      className="glass sticky top-0 z-50"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 flex-shrink-0 group">
          <div className="relative w-8 h-8">
            <div
              className="absolute inset-0 rounded-full opacity-60 blur-md group-hover:opacity-90 transition-opacity"
              style={{ background: "linear-gradient(135deg, #b599e5, #6ee7ff)" }}
            />
            <div
              className="relative w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #b599e5, #8b5cf6, #6ee7ff)" }}
            >
              <Zap className="w-4 h-4 text-white fill-white" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-white tracking-tight text-[15px]">OrbitalDEX</span>
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-widest"
              style={{
                background: "rgba(181,153,229,0.15)",
                color: "#b599e5",
                border: "1px solid rgba(181,153,229,0.25)",
              }}
            >
              beta
            </span>
          </div>
        </Link>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-0.5">
          {NAV_LINKS.map(({ href, label }) => {
            const active = pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200",
                  active ? "text-white" : "text-white/40 hover:text-white/75"
                )}
              >
                {active && (
                  <motion.div
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-xl"
                    style={{
                      background: "rgba(181,153,229,0.12)",
                      border: "1px solid rgba(181,153,229,0.2)",
                    }}
                    transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                  />
                )}
                <span className="relative z-10">{label}</span>
              </Link>
            );
          })}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
            style={{
              background: "rgba(74,222,128,0.08)",
              border: "1px solid rgba(74,222,128,0.18)",
              color: "#4ade80",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse" />
            Testnet
          </div>

          {isLoading ? (
            <div
              className="w-32 h-9 rounded-xl shimmer-line"
              style={{ background: "rgba(255,255,255,0.05)" }}
            />
          ) : isConnected && address ? (
            <button
              onClick={disconnect}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 hover:opacity-80 active:scale-95"
              style={{
                background: "rgba(181,153,229,0.12)",
                border: "1px solid rgba(181,153,229,0.22)",
                color: "#d4bbf5",
              }}
            >
              <span className="w-2 h-2 rounded-full bg-[#4ade80]" />
              {truncate(address)}
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>
          ) : (
            <button
              onClick={connect}
              className="btn-primary px-4 py-2 rounded-xl text-sm"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
