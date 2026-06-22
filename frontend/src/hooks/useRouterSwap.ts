"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { getRouterQuote, RouterQuote } from "@/lib/contract";
import { toStrobes, fromStrobes } from "@/lib/stellar";

export interface RouterSwapQuote {
  amountOut: string;        // human-readable
  amountOutRaw: bigint;
  priceImpact: number;      // percent
  hops: number;
  routeSymbols: string[];   // token symbols along route
  loading: boolean;
  error: string | null;
}

const EMPTY: RouterSwapQuote = {
  amountOut: "",
  amountOutRaw: 0n,
  priceImpact: 0,
  hops: 0,
  routeSymbols: [],
  loading: false,
  error: null,
};

export function useRouterSwap(
  routerAddress: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: string,
  symbolMap: Record<string, string>   // address → symbol
) {
  const [quote, setQuote] = useState<RouterSwapQuote>(EMPTY);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchQuote = useCallback(async () => {
    if (!routerAddress || !tokenIn || !tokenOut || tokenIn === tokenOut || !amountIn || amountIn === "0") {
      setQuote(EMPTY);
      return;
    }

    let inStrobes: bigint;
    try {
      inStrobes = toStrobes(amountIn);
      if (inStrobes <= 0n) { setQuote(EMPTY); return; }
    } catch {
      setQuote(EMPTY);
      return;
    }

    setQuote((q) => ({ ...q, loading: true, error: null }));

    try {
      const result: RouterQuote = await getRouterQuote(routerAddress, tokenIn, tokenOut, inStrobes);
      const routeSymbols = result.route.tokens.map(
        (addr) => symbolMap[addr] ?? addr.slice(0, 6) + "…"
      );
      const priceImpact = Math.max(0, result.route.priceImpactBps / 100);

      setQuote({
        amountOut: fromStrobes(result.amountOut),
        amountOutRaw: result.amountOut,
        priceImpact,
        hops: result.route.hops,
        routeSymbols,
        loading: false,
        error: null,
      });
    } catch (err) {
      const msg = (err as Error).message ?? "";
      const friendly =
        msg.includes("No route found") || msg.includes("NoRouteFound") || msg.includes("#3")
          ? "No liquidity route found for this pair"
          : msg;
      setQuote({ ...EMPTY, loading: false, error: friendly });
    }
  }, [routerAddress, tokenIn, tokenOut, amountIn, symbolMap]);

  // Debounce on input change
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchQuote, 400);
    return () => clearTimeout(debounceRef.current);
  }, [fetchQuote]);

  // Periodic refresh every 15s so quoted price stays fresh while user reads
  useEffect(() => {
    if (!routerAddress || !tokenIn || !tokenOut || !amountIn) return;
    const interval = setInterval(fetchQuote, 15_000);
    return () => clearInterval(interval);
  }, [routerAddress, tokenIn, tokenOut, amountIn, fetchQuote]);

  return quote;
}
