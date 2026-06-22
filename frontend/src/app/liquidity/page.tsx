"use client";
import { useState, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Droplets, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useWallet } from "@/hooks/useWallet";
import {
  POOLS,
  FACTORY_ADDRESS,
  toStrobes,
  fromStrobes,
  tokenSymbol,
  type PoolConfig,
} from "@/lib/stellar";
import {
  executeAddLiquidity,
  executeRemoveLiquidity,
  getUserShares,
  getTotalShares,
  getReserves,
  getFactoryAllPools,
  getPoolTokens,
  getAmp,
  getFeeBps,
  getVirtualPrice,
} from "@/lib/contract";
import { cn } from "@/lib/utils";

const SLIPPAGE_BPS = 50n; // 0.5%

function applySlippage(amount: bigint): bigint {
  return (amount * (10000n - SLIPPAGE_BPS)) / 10000n;
}

function poolLabel(pool: PoolConfig) {
  return `${pool.symbolA} / ${pool.symbolB}`;
}

function PoolPicker({
  pools,
  selected,
  onSelect,
}: {
  pools: PoolConfig[];
  selected: PoolConfig | null;
  onSelect: (p: PoolConfig) => void;
}) {
  if (pools.length === 0) return null;
  return (
    <div className="mb-4">
      <div className="text-xs font-medium mb-2" style={{ color: "rgba(255,255,255,0.35)" }}>Pool</div>
      <div className="flex flex-wrap gap-2">
        {pools.map((p) => (
          <button
            key={p.address}
            onClick={() => onSelect(p)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150"
            style={
              selected?.address === p.address
                ? {
                    background: "rgba(181,153,229,0.18)",
                    border: "1px solid rgba(181,153,229,0.45)",
                    color: "#d4bbf5",
                  }
                : {
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.45)",
                  }
            }
          >
            {poolLabel(p)}
          </button>
        ))}
      </div>
    </div>
  );
}

function LiquidityContent() {
  const { isConnected, connect, address, sign } = useWallet();
  const searchParams = useSearchParams();
  const poolParam = searchParams.get("pool");

  const [tab, setTab] = useState<"add" | "remove">("add");
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [sharesInput, setSharesInput] = useState("");
  const [txState, setTxState] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [txError, setTxError] = useState<string | null>(null);

  const [pools, setPools] = useState<PoolConfig[]>(POOLS);
  const [selectedPool, setSelectedPool] = useState<PoolConfig | null>(POOLS[0] ?? null);
  const [poolAmp, setPoolAmp] = useState<bigint | null>(null);
  const [poolFeeBps, setPoolFeeBps] = useState<number | null>(null);

  const [userShares, setUserShares] = useState<bigint | null>(null);
  const [poolReserves, setPoolReserves] = useState<[bigint, bigint] | null>(null);
  const [totalShares, setTotalShares] = useState<bigint | null>(null);
  const [virtualPrice, setVirtualPrice] = useState<bigint | null>(null);

  // Discover factory pools beyond the static POOLS list
  useEffect(() => {
    if (!FACTORY_ADDRESS) return;
    getFactoryAllPools(FACTORY_ADDRESS)
      .then(async (addresses) => {
        const discovered: PoolConfig[] = [];
        for (const addr of addresses) {
          if (pools.some((p) => p.address === addr)) continue;
          try {
            const [tA, tB] = await getPoolTokens(addr);
            discovered.push({
              address: addr,
              tokenA: tA,
              tokenB: tB,
              symbolA: tokenSymbol(tA),
              symbolB: tokenSymbol(tB),
            });
          } catch {
            // skip unreadable pools
          }
        }
        if (discovered.length > 0) {
          setPools((prev) => {
            const merged = [...prev, ...discovered.filter(d => !prev.some(p => p.address === d.address))];
            return merged;
          });
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-select pool from ?pool= query param (e.g. after pool creation)
  useEffect(() => {
    if (!poolParam) return;
    const found = pools.find((p) => p.address === poolParam);
    if (found) {
      setSelectedPool(found);
    } else if (poolParam) {
      // Pool not in list yet (freshly created) — add a placeholder and select it
      getPoolTokens(poolParam)
        .then(([tA, tB]) => {
          const cfg: PoolConfig = {
            address: poolParam,
            tokenA: tA,
            tokenB: tB,
            symbolA: tokenSymbol(tA),
            symbolB: tokenSymbol(tB),
          };
          setPools((prev) => prev.some((p) => p.address === poolParam) ? prev : [...prev, cfg]);
          setSelectedPool(cfg);
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolParam, pools.length]);

  // Load pool stats when selected pool changes
  useEffect(() => {
    if (!selectedPool) return;
    setPoolAmp(null);
    setPoolFeeBps(null);
    Promise.all([getAmp(selectedPool.address), getFeeBps(selectedPool.address)])
      .then(([amp, fee]) => {
        setPoolAmp(amp);
        setPoolFeeBps(Number(fee));
      })
      .catch(() => {});
  }, [selectedPool]);

  // Load user position
  useEffect(() => {
    if (!selectedPool || !address) return;
    setUserShares(null);
    setTotalShares(null);
    setPoolReserves(null);
    setVirtualPrice(null);
    Promise.all([
      getUserShares(selectedPool.address, address),
      getTotalShares(selectedPool.address),
      getReserves(selectedPool.address),
      getVirtualPrice(selectedPool.address).catch(() => null),
    ])
      .then(([shares, total, reserves, vp]) => {
        setUserShares(shares);
        setTotalShares(total);
        setPoolReserves(reserves);
        setVirtualPrice(vp ?? null);
      })
      .catch(() => {});
  }, [selectedPool, address, txState]);

  const handlePoolSelect = useCallback((p: PoolConfig) => {
    setSelectedPool(p);
    setAmountA("");
    setAmountB("");
    setSharesInput("");
    setTxState("idle");
    setTxError(null);
  }, []);

  const estimatedReceive =
    userShares && totalShares && totalShares > 0n && poolReserves && sharesInput
      ? (() => {
          const s = toStrobes(sharesInput);
          const a = (s * poolReserves[0]) / totalShares;
          const b = (s * poolReserves[1]) / totalShares;
          return [a, b] as [bigint, bigint];
        })()
      : null;

  const handleAdd = useCallback(async () => {
    if (!selectedPool || !address || !amountA || !amountB) return;
    setTxState("pending");
    setTxError(null);
    try {
      const a = toStrobes(amountA);
      const b = toStrobes(amountB);
      await executeAddLiquidity(selectedPool.address, address, a, b, 1n, sign);
      setTxState("success");
      setAmountA("");
      setAmountB("");
    } catch (err) {
      setTxState("error");
      setTxError((err as Error).message);
    }
  }, [selectedPool, address, amountA, amountB, sign]);

  const handleRemove = useCallback(async () => {
    if (!selectedPool || !address || !sharesInput || !estimatedReceive) return;
    setTxState("pending");
    setTxError(null);
    try {
      const shares = toStrobes(sharesInput);
      const minA = applySlippage(estimatedReceive[0]);
      const minB = applySlippage(estimatedReceive[1]);
      await executeRemoveLiquidity(selectedPool.address, address, shares, minA, minB, sign);
      setTxState("success");
      setSharesInput("");
    } catch (err) {
      setTxState("error");
      setTxError((err as Error).message);
    }
  }, [selectedPool, address, sharesInput, estimatedReceive, sign]);

  return (
    <div className="max-w-sm mx-auto px-4 py-10">
      <div className="glass-card rounded-3xl p-5 w-full relative overflow-hidden">
        {/* Top accent glow */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-px pointer-events-none"
          style={{ background: "linear-gradient(90deg, transparent, rgba(181,153,229,0.4), transparent)" }}
        />

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(181,153,229,0.15)", border: "1px solid rgba(181,153,229,0.25)" }}
            >
              <Droplets className="w-4 h-4" style={{ color: "#b599e5" }} />
            </div>
            <div>
              <h2 className="text-[15px] font-bold text-white leading-tight">Liquidity</h2>
              <p className="text-[10px] leading-tight" style={{ color: "rgba(255,255,255,0.3)" }}>
                Earn fees by providing liquidity
              </p>
            </div>
          </div>
          {/* Tab switcher */}
          <div
            className="flex gap-0.5 rounded-xl p-0.5"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            {(["add", "remove"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setTxState("idle"); setTxError(null); }}
                className="px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all duration-150"
                style={
                  tab === t
                    ? {
                        background: "rgba(181,153,229,0.2)",
                        border: "1px solid rgba(181,153,229,0.35)",
                        color: "#d4bbf5",
                      }
                    : {
                        background: "transparent",
                        border: "1px solid transparent",
                        color: "rgba(255,255,255,0.4)",
                      }
                }
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Pool picker */}
        {pools.length > 1 ? (
          <PoolPicker pools={pools} selected={selectedPool} onSelect={handlePoolSelect} />
        ) : pools.length === 0 ? (
          <div
            className="mb-4 text-center py-8 text-sm rounded-2xl"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.35)" }}
          >
            No pools deployed yet.{" "}
            <a href="/pools/create" style={{ color: "#b599e5" }} className="hover:opacity-75 transition-opacity">
              Create one
            </a>
          </div>
        ) : null}

        {selectedPool ? (
          <>
            {/* User position banner */}
            {isConnected && userShares !== null && userShares > 0n && (
              <div
                className="mb-3 rounded-2xl p-3.5 space-y-1.5"
                style={{ background: "rgba(181,153,229,0.07)", border: "1px solid rgba(181,153,229,0.18)" }}
              >
                <div
                  className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider mb-2"
                  style={{ color: "#b599e5" }}
                >
                  <TrendingUp className="w-3 h-3" />
                  Your Position
                </div>
                {totalShares && poolReserves && totalShares > 0n && (
                  <>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: "rgba(255,255,255,0.4)" }}>{selectedPool.symbolA}</span>
                      <span className="font-medium text-white">
                        {fromStrobes((userShares * poolReserves[0]) / totalShares)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: "rgba(255,255,255,0.4)" }}>{selectedPool.symbolB}</span>
                      <span className="font-medium text-white">
                        {fromStrobes((userShares * poolReserves[1]) / totalShares)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: "rgba(255,255,255,0.4)" }}>Pool share</span>
                      <span className="text-white">
                        {((Number(userShares) / Number(totalShares)) * 100).toFixed(4)}%
                      </span>
                    </div>
                  </>
                )}
                {virtualPrice !== null && (
                  <div
                    className="pt-2 mt-2 space-y-1"
                    style={{ borderTop: "1px solid rgba(181,153,229,0.15)" }}
                  >
                    <div className="flex justify-between text-xs">
                      <span
                        style={{ color: "rgba(255,255,255,0.4)" }}
                        title="D/total_shares — measures fee accumulation. Starts at 1.0 and only rises as swap fees enter the pool."
                      >
                        Fee yield index ↗
                      </span>
                      <span
                        className="font-medium"
                        style={{ color: virtualPrice > 10_000_000n ? "#4ade80" : "rgba(255,255,255,0.5)" }}
                      >
                        {(Number(virtualPrice) / 1e7).toFixed(7)}
                        {virtualPrice > 10_000_000n && (
                          <span className="ml-1.5 text-[10px]" style={{ color: "#4ade80" }}>
                            +{((Number(virtualPrice) / 1e7 - 1) * 100).toFixed(4)}%
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
                      Starts at 1.0 · rises with every swap fee · your profit when you withdraw
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Empty position notice */}
            {isConnected && userShares !== null && userShares === 0n && (
              <div
                className="mb-3 rounded-2xl p-3 text-xs text-center"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.35)",
                }}
              >
                You have no position in this pool. Add liquidity to start earning fees.
              </div>
            )}

            {tab === "add" ? (
              <div className="space-y-1.5">
                <div
                  className="rounded-2xl p-4 transition-all duration-200"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  <div className="text-xs font-medium mb-2" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {selectedPool.symbolA}
                  </div>
                  <input
                    type="number"
                    value={amountA}
                    onChange={(e) => setAmountA(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-transparent text-3xl font-bold text-white outline-none placeholder:text-white/15
                               [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                               [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <div
                  className="rounded-2xl p-4 transition-all duration-200"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  <div className="text-xs font-medium mb-2" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {selectedPool.symbolB}
                  </div>
                  <input
                    type="number"
                    value={amountB}
                    onChange={(e) => setAmountB(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-transparent text-3xl font-bold text-white outline-none placeholder:text-white/15
                               [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                               [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <div
                  className="rounded-2xl p-3.5 space-y-2"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>Pool fee</span>
                    <span style={{ color: "#4ade80" }} className="font-medium">
                      {poolFeeBps !== null ? `${(poolFeeBps / 100).toFixed(2)}%` : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>Amplification</span>
                    <span className="font-medium text-white">
                      {poolAmp !== null ? `A = ${poolAmp}` : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>Slippage tolerance</span>
                    <span className="font-medium text-white">0.5%</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div
                  className="rounded-2xl p-4 transition-all duration-200"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                >
                  <div className="text-xs font-medium mb-2" style={{ color: "rgba(255,255,255,0.35)" }}>
                    LP Shares to burn
                  </div>
                  <input
                    type="number"
                    value={sharesInput}
                    onChange={(e) => setSharesInput(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-transparent text-3xl font-bold text-white outline-none placeholder:text-white/15
                               [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                               [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <div
                  className="rounded-2xl p-3.5 space-y-2"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>You receive ({selectedPool.symbolA})</span>
                    <span className="font-medium text-white">
                      {estimatedReceive ? fromStrobes(estimatedReceive[0]) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>You receive ({selectedPool.symbolB})</span>
                    <span className="font-medium text-white">
                      {estimatedReceive ? fromStrobes(estimatedReceive[1]) : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>Slippage tolerance</span>
                    <span className="font-medium text-white">0.5%</span>
                  </div>
                </div>
              </div>
            )}

            <AnimatePresence>
              {txError && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  className="mt-3 rounded-2xl p-3.5 text-xs break-all"
                  style={{ background: "rgba(255,92,122,0.08)", border: "1px solid rgba(255,92,122,0.25)", color: "#ff5c7a" }}
                >
                  {txError}
                </motion.div>
              )}

              {txState === "success" && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-3 rounded-2xl p-3.5 text-xs flex items-center gap-2"
                  style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", color: "#4ade80" }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" />
                  Transaction confirmed!
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-4">
              {!isConnected ? (
                <Button onClick={connect} className="w-full" size="lg">
                  Connect Wallet
                </Button>
              ) : txState === "pending" ? (
                <Button loading className="w-full" size="lg">
                  Confirming…
                </Button>
              ) : tab === "add" ? (
                <Button
                  onClick={handleAdd}
                  disabled={!amountA || !amountB}
                  className="w-full"
                  size="lg"
                >
                  Add Liquidity
                </Button>
              ) : (
                <Button
                  onClick={handleRemove}
                  disabled={!sharesInput}
                  className="w-full"
                  size="lg"
                >
                  Remove Liquidity
                </Button>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function LiquidityPage() {
  return (
    <Suspense>
      <LiquidityContent />
    </Suspense>
  );
}
