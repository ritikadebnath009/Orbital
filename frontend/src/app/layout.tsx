import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/NavBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "OrbitalDEX — Trade Instantly Across Chains",
  description: "Premium StableSwap DEX on Stellar Soroban. Swap stablecoins with near-zero slippage. Powered by Curve's amplified invariant.",
  keywords: ["DEX", "Stellar", "Soroban", "StableSwap", "DeFi", "USDC", "USDT"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full text-white" style={{ background: "#07070a" }}>
        <NavBar />
        <main>{children}</main>
      </body>
    </html>
  );
}
