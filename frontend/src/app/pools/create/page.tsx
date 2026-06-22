"use client";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useWallet } from "@/hooks/useWallet";
import { FACTORY_ADDRESS, KNOWN_TOKENS } from "@/lib/stellar";
import { executeCreatePool } from "@/lib/contract";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-medium text-neutral-400 uppercase tracking-wide">
          {label}
        </label>
        {hint && (
          <div className="group relative">
            <Info className="w-3 h-3 text-neutral-600 cursor-help" />
            <div className="absolute left-4 bottom-0 hidden group-hover:block z-10
                            w-56 bg-neutral-800 border border-neutral-700 rounded-lg
                            p-2 text-xs text-neutral-300 shadow-xl">
              {hint}
            </div>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export default function CreatePoolPage() {
  const router = useRouter();
  const { isConnected, connect, address, sign } = useWallet();

  const [tokenA, setTokenA] = useState(KNOWN_TOKENS[0]?.address ?? "");
  const [tokenB, setTokenB] = useState(KNOWN_TOKENS[1]?.address ?? "");
  const [amp, setAmp] = useState("100");
  const [feeBps, setFeeBps] = useState("4");
  const [txState, setTxState] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [txError, setTxError] = useState<string | null>(null);

  const ampNum = parseInt(amp) || 0;
  const feeNum = parseInt(feeBps) || 0;

  const validation =
    !tokenA || !tokenB
      ? "Select both tokens"
      : tokenA === tokenB
      ? "Tokens must be different"
      : ampNum < 1 || ampNum > 1_000_000
      ? "Amplification must be 1 – 1,000,000"
      : feeNum < 1 || feeNum > 1000
      ? "Fee must be 1 – 1000 bps (0.01% – 10%)"
      : null;

  const handleCreate = useCallback(async () => {
    if (!address || validation || !FACTORY_ADDRESS) return;
    setTxState("pending");
    setTxError(null);
    try {
      const poolAddress = await executeCreatePool(
        FACTORY_ADDRESS,
        address,
        tokenA,
        tokenB,
        ampNum,
        feeNum,
        sign
      );
      setTxState("success");
      // Redirect to liquidity with new pool pre-selected so user can seed it immediately
      setTimeout(() => router.push(`/liquidity?pool=${poolAddress}`), 1500);
    } catch (err) {
      setTxState("error");
      setTxError((err as Error).message);
    }
  }, [address, tokenA, tokenB, ampNum, feeNum, sign, validation, router]);

  return (
    <div className="max-w-sm mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white mb-1">Create Pool</h1>
        <p className="text-neutral-400 text-sm">
          Deploy a new StableSwap pool via the factory.
        </p>
      </div>

      <div className="rounded-2xl bg-neutral-950 border border-neutral-800 p-5 space-y-5">

        {/* Token A */}
        <Field
          label="Token A"
          hint="The first token in the pair. Order determines storage but not pricing — pairs are canonical."
        >
          <select
            value={tokenA}
            onChange={(e) => setTokenA(e.target.value)}
            className="w-full rounded-xl bg-neutral-900 border border-neutral-800
                       text-white px-3 py-2.5 text-sm outline-none
                       focus:border-blue-600 transition-colors"
          >
            <option value="">Select token…</option>
            {KNOWN_TOKENS.map((t) => (
              <option key={t.address} value={t.address}>
                {t.symbol} — {t.name}
              </option>
            ))}
          </select>
        </Field>

        {/* Token B */}
        <Field label="Token B">
          <select
            value={tokenB}
            onChange={(e) => setTokenB(e.target.value)}
            className="w-full rounded-xl bg-neutral-900 border border-neutral-800
                       text-white px-3 py-2.5 text-sm outline-none
                       focus:border-blue-600 transition-colors"
          >
            <option value="">Select token…</option>
            {KNOWN_TOKENS.map((t) => (
              <option key={t.address} value={t.address}>
                {t.symbol} — {t.name}
              </option>
            ))}
          </select>
        </Field>

        {/* Amplification */}
        <Field
          label="Amplification (A)"
          hint="Higher A = tighter peg, less slippage near 1:1. Recommended: 50–200 for stablecoin pairs, 4–10 for volatile assets."
        >
          <div className="space-y-2">
            <input
              type="number"
              value={amp}
              min={1}
              max={1_000_000}
              onChange={(e) => setAmp(e.target.value)}
              className="w-full rounded-xl bg-neutral-900 border border-neutral-800
                         text-white px-3 py-2.5 text-sm outline-none
                         focus:border-blue-600 transition-colors
                         [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                         [&::-webkit-inner-spin-button]:appearance-none"
            />
            {/* Quick presets */}
            <div className="flex gap-1.5">
              {[10, 50, 100, 200].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmp(String(v))}
                  className={cn(
                    "flex-1 rounded-lg py-1 text-xs font-medium transition-colors",
                    amp === String(v)
                      ? "bg-blue-600 text-white"
                      : "bg-neutral-800 text-neutral-400 hover:text-white"
                  )}
                >
                  A={v}
                </button>
              ))}
            </div>
          </div>
        </Field>

        {/* Fee */}
        <Field
          label="Swap fee (bps)"
          hint="Fee charged on each swap. 1 bps = 0.01%. Stablecoin pools typically use 1–4 bps."
        >
          <div className="space-y-2">
            <div className="relative">
              <input
                type="number"
                value={feeBps}
                min={1}
                max={1000}
                onChange={(e) => setFeeBps(e.target.value)}
                className="w-full rounded-xl bg-neutral-900 border border-neutral-800
                           text-white px-3 py-2.5 pr-24 text-sm outline-none
                           focus:border-blue-600 transition-colors
                           [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none
                           [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">
                = {feeNum > 0 ? (feeNum / 100).toFixed(2) : "0.00"}%
              </span>
            </div>
            <div className="flex gap-1.5">
              {[1, 4, 10, 30].map((v) => (
                <button
                  key={v}
                  onClick={() => setFeeBps(String(v))}
                  className={cn(
                    "flex-1 rounded-lg py-1 text-xs font-medium transition-colors",
                    feeBps === String(v)
                      ? "bg-blue-600 text-white"
                      : "bg-neutral-800 text-neutral-400 hover:text-white"
                  )}
                >
                  {(v / 100).toFixed(2)}%
                </button>
              ))}
            </div>
          </div>
        </Field>

        {/* Summary */}
        {!validation && (
          <div className="rounded-xl bg-neutral-900 border border-neutral-800 p-3 text-xs space-y-1 text-neutral-400">
            <div className="flex justify-between">
              <span>Pair</span>
              <span className="text-white">
                {KNOWN_TOKENS.find((t) => t.address === tokenA)?.symbol} /{" "}
                {KNOWN_TOKENS.find((t) => t.address === tokenB)?.symbol}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Amplification</span>
              <span className="text-white">A = {ampNum}</span>
            </div>
            <div className="flex justify-between">
              <span>Swap fee</span>
              <span className="text-white">{(feeNum / 100).toFixed(2)}%</span>
            </div>
            <div className="flex justify-between">
              <span>Factory</span>
              <span className="text-white font-mono text-[10px]">
                {FACTORY_ADDRESS ? FACTORY_ADDRESS.slice(0, 8) + "…" : "Not configured"}
              </span>
            </div>
          </div>
        )}

        {txError && (
          <div className="rounded-xl bg-red-900/20 border border-red-800 p-3 text-xs text-red-400 break-all">
            {txError}
          </div>
        )}

        {txState === "success" && (
          <div className="rounded-xl bg-green-900/20 border border-green-800 p-3 text-xs text-green-400">
            Pool created! Taking you to add initial liquidity…
          </div>
        )}

        {!FACTORY_ADDRESS && (
          <div className="rounded-xl bg-yellow-900/20 border border-yellow-800 p-3 text-xs text-yellow-400">
            Set <code>NEXT_PUBLIC_FACTORY_ADDRESS</code> in .env.local to enable pool creation.
          </div>
        )}

        <div>
          {!isConnected ? (
            <Button onClick={connect} className="w-full" size="lg">
              Connect Wallet
            </Button>
          ) : txState === "pending" ? (
            <Button loading className="w-full" size="lg">
              Creating pool…
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={!!validation || !FACTORY_ADDRESS}
              className="w-full"
              size="lg"
            >
              {validation ?? "Create Pool"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
