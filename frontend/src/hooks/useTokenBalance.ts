"use client";
import { useState, useEffect } from "react";
import { getTokenBalance } from "@/lib/contract";
import { fromStrobes } from "@/lib/stellar";

interface TokenBalance {
  raw: bigint;
  formatted: string;
  loading: boolean;
  hasTrustline: boolean;
}

export function useTokenBalance(
  tokenAddress: string | null | undefined,
  userAddress: string | null | undefined,
  refreshTrigger?: unknown
): TokenBalance {
  const [raw, setRaw] = useState(0n);
  const [loading, setLoading] = useState(false);
  const [hasTrustline, setHasTrustline] = useState(true);

  const enabled = Boolean(tokenAddress && userAddress);

  useEffect(() => {
    // Nothing to fetch — leave state alone rather than synchronously
    // resetting it here; the "disabled" case is handled below from `enabled`
    // directly so no setState call is needed on this path at all.
    if (!enabled) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const bal = await getTokenBalance(tokenAddress!, userAddress!);
        if (cancelled) return;
        setRaw(bal);
        setHasTrustline(true);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        // SAC returns an error when the trustline doesn't exist
        if (msg.includes("trustline") || msg.includes("MissingValue") || msg.includes("#13")) {
          setHasTrustline(false);
        } else {
          setHasTrustline(true);
        }
        setRaw(0n);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();

    // Guards against a slower fetch for a since-changed token/user
    // overwriting fresher state after this effect has already re-run.
    return () => {
      cancelled = true;
    };
  }, [enabled, tokenAddress, userAddress, refreshTrigger]);

  return {
    raw: enabled ? raw : 0n,
    formatted: !enabled
      ? "0.0000000"
      : !hasTrustline
      ? "—"
      : raw > 0n
      ? fromStrobes(raw)
      : "0.0000000",
    loading: enabled && loading,
    hasTrustline: enabled ? hasTrustline : true,
  };
}
