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

  useEffect(() => {
    if (!tokenAddress || !userAddress) {
      setRaw(0n);
      setHasTrustline(true);
      return;
    }
    setLoading(true);
    getTokenBalance(tokenAddress, userAddress)
      .then((bal) => {
        setRaw(bal);
        setHasTrustline(true);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        // SAC returns an error when the trustline doesn't exist
        if (msg.includes("trustline") || msg.includes("MissingValue") || msg.includes("#13")) {
          setHasTrustline(false);
        } else {
          setHasTrustline(true);
        }
        setRaw(0n);
      })
      .finally(() => setLoading(false));
  }, [tokenAddress, userAddress, refreshTrigger]);

  return {
    raw,
    formatted: !hasTrustline ? "—" : raw > 0n ? fromStrobes(raw) : "0.0000000",
    loading,
    hasTrustline,
  };
}
