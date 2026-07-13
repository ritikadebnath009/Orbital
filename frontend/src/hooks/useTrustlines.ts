"use client";
import { useState, useEffect, useCallback } from "react";
import { checkTrustlines, buildTrustlineTransaction, TrustlineStatus } from "@/lib/trustline";
import { submitClassicXdr } from "@/lib/contract";
import { KNOWN_TOKENS, NETWORK_PASSPHRASE, TokenInfo } from "@/lib/stellar";

type SignFn = (xdr: string, networkPassphrase: string) => Promise<string>;

interface TrustlineState {
  statuses: TrustlineStatus[];
  missingTokens: TokenInfo[];
  loading: boolean;
  approving: boolean;
  error: string | null;
  refetch: () => void;
  setupTrustlines: (sign: SignFn) => Promise<void>;
}

export function useTrustlines(
  address: string | null | undefined,
  refreshTrigger?: unknown
): TrustlineState {
  const [statuses, setStatuses] = useState<TrustlineStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const refetch = useCallback(() => setTick((n) => n + 1), []);

  const enabled = Boolean(address);

  useEffect(() => {
    // No address — the "disabled" case is handled below via `enabled`
    // directly, so nothing needs resetting here.
    if (!enabled) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const s = await checkTrustlines(address!, KNOWN_TOKENS);
        if (!cancelled) setStatuses(s);
      } catch {
        if (!cancelled) setStatuses([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();

    return () => {
      cancelled = true;
    };
  }, [enabled, address, tick, refreshTrigger]);

  const effectiveStatuses = enabled ? statuses : [];
  const missingTokens = effectiveStatuses
    .filter((s) => !s.hasTrustline && s.token.issuer)
    .map((s) => s.token);

  const setupTrustlines = useCallback(
    async (sign: SignFn) => {
      if (!address || missingTokens.length === 0) return;
      setApproving(true);
      setError(null);
      try {
        const unsignedXdr = await buildTrustlineTransaction(address, missingTokens);
        const signedXdr = await sign(unsignedXdr, NETWORK_PASSPHRASE);
        await submitClassicXdr(signedXdr);
        refetch();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setApproving(false);
      }
    },
    [address, missingTokens, refetch]
  );

  return {
    statuses: effectiveStatuses,
    missingTokens,
    loading: enabled && loading,
    approving,
    error,
    refetch,
    setupTrustlines,
  };
}
