"use client";
import { useState, useCallback, useMemo } from "react";
import { ArrowDownUp, AlertTriangle, ChevronDown, Check, Settings, Droplets, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { useRouterSwap } from "@/hooks/useRouterSwap";
import { useWallet } from "@/hooks/useWallet";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useTrustlines } from "@/hooks/useTrustlines";
import { ROUTER_ADDRESS, KNOWN_TOKENS, toStrobes, fromStrobes, PRECISION } from "@/lib/stellar";
import { executeRouterSwap, executeSwap, getCurrentLedger } from "@/lib/contract";
import { POOLS } from "@/lib/stellar";

const PRESET_SLIPPAGES = [
  { label: "0.1%", bps: 10n },
  { label: "0.5%", bps: 50n },
  { label: "1.0%", bps: 100n },
];

const TOKEN_COLORS: Record<string, string> = {
  USDC: "#4ade80",
  USDT: "#fbbf24",
  XLM: "#6ee7ff",
  EURC: "#b599e5",
};

function tokenColor(symbol?: string) {
  return symbol ? (TOKEN_COLORS[symbol] ?? "#b599e5") : "#b599e5";
}

// ── Token picker dropdown ─────────────────────────────────────────────────────

interface TokenPickerProps {
  selected: string;
  exclude: string;
  onChange: (addr: string) => void;
}

function TokenPicker({ selected, exclude, onChange }: TokenPickerProps) {
  const [open, setOpen] = useState(false);
  const token = KNOWN_TOKENS.find((t) => t.address === selected);
  const color = tokenColor(token?.symbol);
  const options = KNOWN_TOKENS.filter((t) => t.address !== exclude && t.address);

  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200 active:scale-95"
        style={{
          background: "rgba(255,255,255,0.07)",
          border: `1px solid ${color}30`,
        }}
        onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)"; }}
        onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)"; }}
      >
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
          style={{ background: `${color}25`, border: `1px solid ${color}50` }}
        >
          {token?.symbol?.[0] ?? "?"}
        </div>
        <span className="text-sm font-semibold text-white">{token?.symbol ?? "Select"}</span>
        <ChevronDown
          className="w-3.5 h-3.5 transition-transform duration-200"
          style={{ color: "rgba(255,255,255,0.4)", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -6 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-full mt-2 z-50 w-52 rounded-2xl overflow-hidden"
            style={{
              background: "rgba(18,18,24,0.98)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(181,153,229,0.08)",
              backdropFilter: "blur(40px)",
            }}
          >
            <div
              className="px-3 py-2.5 text-xs font-semibold uppercase tracking-widest"
              style={{ color: "rgba(255,255,255,0.3)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              Select token
            </div>
            {options.map((t) => {
              const c = tokenColor(t.symbol);
              return (
                <button
                  key={t.address}
                  onClick={() => { onChange(t.address); setOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-3 transition-colors text-left group"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                  onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; }}
                  onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                    style={{ background: `${c}20`, border: `1px solid ${c}40` }}
                  >
                    {t.symbol[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white">{t.symbol}</div>
                    <div className="text-xs truncate" style={{ color: "rgba(255,255,255,0.35)" }}>{t.name}</div>
                  </div>
                  {t.address === selected && (
                    <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#b599e5" }} />
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}
    </div>
  );
}

// ── Slippage settings popover ─────────────────────────────────────────────────

interface SlippageSettingsProps {
  slippageBps: bigint;
  onChange: (bps: bigint) => void;
}

function SlippageSettings({ slippageBps, onChange }: SlippageSettingsProps) {
  const [open, setOpen] = useState(false);
  const [customInput, setCustomInput] = useState("");

  const activePreset = PRESET_SLIPPAGES.find((p) => p.bps === slippageBps);
  const label = activePreset ? activePreset.label : `${Number(slippageBps) / 100}%`;

  const handleCustom = (val: string) => {
    setCustomInput(val);
    const pct = parseFloat(val);
    if (!isNaN(pct) && pct > 0 && pct <= 50) {
      onChange(BigInt(Math.round(pct * 100)));
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl transition-all duration-200"
        style={{
          background: open ? "rgba(181,153,229,0.12)" : "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "rgba(255,255,255,0.5)",
        }}
        onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.8)"; }}
        onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.5)"; }}
      >
        <Settings className="w-3 h-3" />
        {label}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 z-50 w-60 rounded-2xl p-4"
            style={{
              background: "rgba(18,18,24,0.98)",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
              backdropFilter: "blur(40px)",
            }}
          >
            <div
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              Slippage Tolerance
            </div>
            <div className="flex gap-2 mb-3">
              {PRESET_SLIPPAGES.map((p) => (
                <button
                  key={p.label}
                  onClick={() => { onChange(p.bps); setCustomInput(""); }}
                  className="flex-1 text-xs py-2 rounded-xl transition-all duration-150 font-semibold"
                  style={
                    slippageBps === p.bps
                      ? { background: "rgba(181,153,229,0.2)", border: "1px solid rgba(181,153,229,0.4)", color: "#d4bbf5" }
                      : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.55)" }
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
            <input
              type="number"
              value={customInput}
              onChange={(e) => handleCustom(e.target.value)}
              placeholder="Custom %"
              min="0.01"
              max="50"
              step="0.01"
              className="w-full text-white text-xs rounded-xl px-3 py-2.5 outline-none placeholder:opacity-30"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
              onFocus={(e) => { (e.target as HTMLElement).style.borderColor = "rgba(181,153,229,0.4)"; }}
              onBlur={(e) => { (e.target as HTMLElement).style.borderColor = "rgba(255,255,255,0.1)"; }}
            />
            {slippageBps > 100n && (
              <div
                className="mt-2.5 text-xs flex items-center gap-1.5 p-2 rounded-lg"
                style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}
              >
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                High slippage — may be frontrun
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}
    </div>
  );
}

// ── Token amount input ────────────────────────────────────────────────────────

interface TokenInputProps {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  tokenAddr: string;
  excludeAddr: string;
  onTokenChange: (addr: string) => void;
  readonly?: boolean;
  loading?: boolean;
  balance?: string;
  balanceLoading?: boolean;
  onMax?: () => void;
}

function TokenInput({
  label, value, onChange, tokenAddr, excludeAddr, onTokenChange,
  readonly, loading, balance, balanceLoading, onMax,
}: TokenInputProps) {
  const token = KNOWN_TOKENS.find((t) => t.address === tokenAddr);
  const color = tokenColor(token?.symbol);

  return (
    <div
      className="rounded-2xl p-4 transition-all duration-200"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>
          {label}
        </span>
        {balance !== undefined && (
          <span className="flex items-center gap-1.5 text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
            {balanceLoading ? (
              <span
                className="w-14 h-3 rounded inline-block"
                style={{ background: "rgba(255,255,255,0.08)", animation: "pulse 1.5s ease-in-out infinite" }}
              />
            ) : (
              <>
                <span>{balance}</span>
                {onMax && parseFloat(balance) > 0 && (
                  <button
                    onClick={onMax}
                    className="text-xs font-bold px-1.5 py-0.5 rounded-md transition-colors"
                    style={{ background: `${color}15`, color: color }}
                    onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.background = `${color}25`; }}
                    onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.background = `${color}15`; }}
                  >
                    MAX
                  </button>
                )}
              </>
            )}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center">
              <div
                className="h-8 rounded-lg w-3/4"
                style={{ background: "rgba(255,255,255,0.06)", animation: "pulse 1.5s ease-in-out infinite" }}
              />
            </div>
          )}
          <input
            type="number"
            value={loading ? "" : value}
            onChange={(e) => onChange?.(e.target.value)}
            readOnly={readonly || loading}
            placeholder="0.00"
            className="w-full bg-transparent text-3xl font-bold outline-none text-white placeholder:text-white/15"
          />
        </div>
        <TokenPicker selected={tokenAddr} exclude={excludeAddr} onChange={onTokenChange} />
      </div>
    </div>
  );
}

// ── Main SwapCard ─────────────────────────────────────────────────────────────

export function SwapCard() {
  const { isConnected, connect, address, sign } = useWallet();

  const [tokenIn, setTokenIn] = useState(KNOWN_TOKENS[0]?.address ?? "");
  const [tokenOut, setTokenOut] = useState(KNOWN_TOKENS[1]?.address ?? "");
  const [amountIn, setAmountIn] = useState("");
  const [slippageBps, setSlippageBps] = useState(50n);
  const [txState, setTxState] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const [faucetState, setFaucetState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [faucetError, setFaucetError] = useState<string | null>(null);
  const [flipRotate, setFlipRotate] = useState(0);

  const tokenInBalance = useTokenBalance(tokenIn, address, txState);
  const tokenOutBalance = useTokenBalance(tokenOut, address, txState);

  const { missingTokens, approving: trustlineApproving, error: trustlineError,
    refetch: refetchTrustlines, setupTrustlines } = useTrustlines(address, txState);

  const symbolMap = useMemo(
    () => Object.fromEntries(KNOWN_TOKENS.map((t) => [t.address, t.symbol])),
    []
  );

  const useRouter = !!ROUTER_ADDRESS;

  const routerQuote = useRouterSwap(
    ROUTER_ADDRESS,
    tokenIn,
    tokenOut,
    useRouter ? amountIn : "",
    symbolMap
  );

  const directPool = POOLS.find(
    (p) =>
      (p.tokenA === tokenIn && p.tokenB === tokenOut) ||
      (p.tokenB === tokenIn && p.tokenA === tokenOut)
  );

  const displayOut = useRouter ? routerQuote.amountOut : "";
  const displayLoading = useRouter ? routerQuote.loading : false;
  const displayError = useRouter ? routerQuote.error : null;
  const priceImpact = useRouter ? routerQuote.priceImpact : 0;
  const hops = useRouter ? routerQuote.hops : 1;
  const routeSymbols = useRouter ? routerQuote.routeSymbols : [];

  const amountOutRaw: bigint = useRouter ? (routerQuote.amountOutRaw ?? 0n) : 0n;
  const amountInRaw: bigint = useMemo(() => {
    if (!amountIn) return 0n;
    try { return toStrobes(amountIn); } catch { return 0n; }
  }, [amountIn]);

  const minReceivedFormatted = useMemo(() => {
    if (amountOutRaw === 0n) return "—";
    const minRaw = (amountOutRaw * (10000n - slippageBps)) / 10000n;
    return fromStrobes(minRaw);
  }, [amountOutRaw, slippageBps]);

  const priceRatioFormatted = useMemo(() => {
    if (amountOutRaw === 0n || amountInRaw === 0n) return "—";
    const ratio = (amountOutRaw * PRECISION) / amountInRaw;
    const whole = ratio / PRECISION;
    const frac = String(ratio % PRECISION).padStart(7, "0").slice(0, 6);
    return `${whole}.${frac}`;
  }, [amountOutRaw, amountInRaw]);

  const handleFlip = useCallback(() => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn("");
    setTxState("idle");
    setTxError(null);
    setFlipRotate((r) => r + 180);
  }, [tokenIn, tokenOut]);

  const handleMax = useCallback(() => {
    if (tokenInBalance.raw > 0n) {
      setAmountIn(fromStrobes(tokenInBalance.raw));
      setTxState("idle");
      setTxError(null);
    }
  }, [tokenInBalance.raw]);

  const handleSwap = useCallback(async () => {
    if (!address || !amountIn) return;
    setTxState("pending");
    setTxError(null);
    try {
      const inStrobes = toStrobes(amountIn);
      const minOut = (amountOutRaw * (10000n - slippageBps)) / 10000n;

      if (useRouter && ROUTER_ADDRESS) {
        const ledger = await getCurrentLedger();
        await executeRouterSwap(
          ROUTER_ADDRESS,
          address,
          tokenIn,
          tokenOut,
          inStrobes,
          minOut,
          ledger + 100,
          sign
        );
      } else if (directPool) {
        await executeSwap(directPool.address, address, tokenIn, inStrobes, minOut, sign);
      } else {
        throw new Error("No route available for this pair");
      }

      setTxState("success");
      setAmountIn("");
    } catch (err) {
      setTxState("error");
      setTxError((err as Error).message);
    }
  }, [address, amountIn, tokenIn, tokenOut, amountOutRaw, slippageBps, useRouter, directPool, sign]);

  const handleFaucet = useCallback(async () => {
    if (!address) return;
    setFaucetState("loading");
    setFaucetError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/faucet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Request failed: ${res.status}`);
      }
      setFaucetState("done");
      refetchTrustlines();
    } catch (err) {
      setFaucetState("error");
      setFaucetError((err as Error).message);
    }
  }, [address, refetchTrustlines]);

  const priceImpactStyle =
    priceImpact > 5
      ? { color: "#ff5c7a" }
      : priceImpact > 1
      ? { color: "#fbbf24" }
      : { color: "#4ade80" };

  const insufficientBalance =
    isConnected &&
    !!amountIn &&
    tokenInBalance.hasTrustline &&
    tokenInBalance.raw > 0n &&
    amountInRaw > tokenInBalance.raw;

  const needsTrustline = isConnected && missingTokens.length > 0;

  const canSwap =
    !!amountIn && !!tokenIn && !!tokenOut && tokenIn !== tokenOut &&
    !insufficientBalance && !needsTrustline &&
    (useRouter ? !!routerQuote.amountOut && !routerQuote.loading : !!directPool);

  if (KNOWN_TOKENS.length < 2) {
    return (
      <div
        className="glass-card rounded-3xl p-6 text-center text-sm"
        style={{ color: "rgba(255,255,255,0.4)" }}
      >
        Set token addresses in{" "}
        <code className="text-white/70">.env.local</code> to enable swaps.
      </div>
    );
  }

  return (
    <div
      className="glass-card rounded-3xl p-5 w-full relative overflow-hidden"
    >
      {/* Subtle top accent glow */}
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
            <Zap className="w-4 h-4" style={{ color: "#b599e5" }} />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-white leading-tight">Swap</h2>
            {useRouter && (
              <p className="text-[10px] leading-tight" style={{ color: "rgba(255,255,255,0.3)" }}>
                via Smart Router
              </p>
            )}
          </div>
        </div>
        <SlippageSettings slippageBps={slippageBps} onChange={setSlippageBps} />
      </div>

      {/* Token inputs */}
      <div className="relative flex flex-col gap-1.5">
        <TokenInput
          label="You pay"
          value={amountIn}
          onChange={(v) => { setAmountIn(v); setTxState("idle"); setTxError(null); }}
          tokenAddr={tokenIn}
          excludeAddr={tokenOut}
          onTokenChange={(a) => { setTokenIn(a); setAmountIn(""); }}
          balance={isConnected ? tokenInBalance.formatted : undefined}
          balanceLoading={tokenInBalance.loading}
          onMax={isConnected ? handleMax : undefined}
        />

        {/* Flip button */}
        <div className="flex justify-center relative z-10 -my-1">
          <motion.button
            onClick={handleFlip}
            animate={{ rotate: flipRotate }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-90"
            style={{
              background: "rgba(181,153,229,0.12)",
              border: "1px solid rgba(181,153,229,0.25)",
              boxShadow: "0 0 20px rgba(181,153,229,0.15)",
            }}
            whileHover={{
              boxShadow: "0 0 28px rgba(181,153,229,0.35)",
              scale: 1.05,
            }}
            whileTap={{ scale: 0.9 }}
          >
            <ArrowDownUp className="w-4 h-4" style={{ color: "#b599e5" }} />
          </motion.button>
        </div>

        <TokenInput
          label="You receive"
          value={displayOut}
          tokenAddr={tokenOut}
          excludeAddr={tokenIn}
          onTokenChange={(a) => { setTokenOut(a); setAmountIn(""); }}
          readonly
          loading={displayLoading}
          balance={isConnected ? tokenOutBalance.formatted : undefined}
          balanceLoading={tokenOutBalance.loading}
        />
      </div>

      {/* Quote details */}
      <AnimatePresence>
        {displayOut && !displayLoading && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div
              className="mt-3 rounded-2xl p-3.5 space-y-2"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              {hops > 0 && routeSymbols.length > 0 && (
                <div className="flex justify-between text-xs">
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>Route</span>
                  <span className="font-medium text-white">{routeSymbols.join(" → ")}</span>
                </div>
              )}
              {hops === 2 && (
                <div className="flex justify-between text-xs">
                  <span style={{ color: "rgba(255,255,255,0.4)" }}>Hops</span>
                  <span style={{ color: "#fbbf24" }} className="font-medium">2-hop swap</span>
                </div>
              )}
              <div className="flex justify-between text-xs">
                <span style={{ color: "rgba(255,255,255,0.4)" }}>Rate</span>
                <span className="font-medium text-white">
                  1 {symbolMap[tokenIn]} = {priceRatioFormatted} {symbolMap[tokenOut]}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="flex items-center gap-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Price Impact
                  {priceImpact > 1 && <AlertTriangle className="w-3 h-3" style={priceImpactStyle} />}
                </span>
                <span className="font-semibold" style={priceImpactStyle}>
                  {priceImpact.toFixed(3)}%
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: "rgba(255,255,255,0.4)" }}>Min received</span>
                <span className="font-medium text-white">
                  {minReceivedFormatted} {symbolMap[tokenOut]}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: "rgba(255,255,255,0.4)" }}>Fee</span>
                <span style={{ color: "#4ade80" }} className="font-medium">0.04%</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trustline banner */}
      {isConnected && needsTrustline && (
        <div
          className="mt-3 rounded-2xl p-4"
          style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)" }}
        >
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "#fbbf24" }} />
            <div className="text-xs leading-relaxed" style={{ color: "#fbbf24" }}>
              <span className="font-semibold">Token access required.</span>{" "}
              Enable {missingTokens.map((t) => t.symbol).join(", ")} to swap.
            </div>
          </div>
          <Button
            onClick={() => setupTrustlines(sign)}
            loading={trustlineApproving}
            size="sm"
            className="w-full text-xs"
          >
            Enable {missingTokens.map((t) => t.symbol).join(" + ")} in Wallet
          </Button>
          {trustlineError && (
            <div className="mt-2 text-xs break-all" style={{ color: "#ff5c7a" }}>{trustlineError}</div>
          )}
        </div>
      )}

      {/* Faucet section */}
      {isConnected && (
        <div
          className="mt-3 rounded-2xl p-4 space-y-3"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>
            Get Test Tokens
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
              <Droplets className="w-3.5 h-3.5" />
              XLM (10,000 free)
            </div>
            <Button
              onClick={handleFaucet}
              loading={faucetState === "loading"}
              size="sm"
              variant="secondary"
              className="text-xs"
              disabled={faucetState === "done"}
            >
              {faucetState === "done" ? "Sent ✓" : "Get XLM"}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>USDC (Circle testnet)</div>
            <a
              href="https://faucet.circle.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium transition-colors"
              style={{ color: "#6ee7ff" }}
              onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.75"; }}
              onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
            >
              Get USDC →
            </a>
          </div>
          {faucetState === "done" && (
            <div className="text-xs" style={{ color: "#4ade80" }}>10,000 XLM sent to your wallet.</div>
          )}
          {faucetState === "error" && faucetError && (
            <div className="text-xs break-all" style={{ color: "#ff5c7a" }}>{faucetError}</div>
          )}
        </div>
      )}

      {/* Error / success states */}
      <AnimatePresence>
        {(displayError || txError) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mt-3 rounded-2xl p-3.5 text-xs break-all"
            style={{ background: "rgba(255,92,122,0.08)", border: "1px solid rgba(255,92,122,0.25)", color: "#ff5c7a" }}
          >
            {txError ?? displayError}
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
            Swap confirmed successfully!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action button */}
      <div className="mt-4">
        {!isConnected ? (
          <Button onClick={connect} className="w-full" size="lg">
            Connect Wallet
          </Button>
        ) : needsTrustline ? (
          <Button
            onClick={() => setupTrustlines(sign)}
            loading={trustlineApproving}
            className="w-full"
            size="lg"
          >
            Enable Tokens to Swap
          </Button>
        ) : !amountIn ? (
          <Button disabled className="w-full" size="lg" variant="secondary">
            Enter an amount
          </Button>
        ) : displayLoading ? (
          <Button loading className="w-full" size="lg">
            Getting quote…
          </Button>
        ) : txState === "pending" ? (
          <Button loading className="w-full" size="lg">
            Confirming…
          </Button>
        ) : insufficientBalance ? (
          <Button disabled className="w-full" size="lg" variant="secondary">
            Insufficient balance
          </Button>
        ) : !canSwap ? (
          <Button disabled className="w-full" size="lg" variant="secondary">
            No route found
          </Button>
        ) : (
          <Button onClick={handleSwap} className="w-full" size="lg">
            Swap {symbolMap[tokenIn]} → {symbolMap[tokenOut]}
          </Button>
        )}
      </div>
    </div>
  );
}
