"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { HORIZON_URL } from "@/lib/stellar";

export interface PoolSwapEvent {
  id: string;
  type: "swap" | "add_liq" | "rm_liq";
  poolAddress: string;
  txHash: string;
  ledger: number;
  timestamp: string;
  data: Record<string, unknown>;
}

interface HorizonTransactionsResponse {
  _embedded: {
    records: HorizonTransaction[];
  };
}

interface HorizonTransaction {
  id: string;
  hash: string;
  ledger: number;
  created_at: string;
  memo?: string;
}

const POLL_INTERVAL_MS = 15_000; // 15 seconds
const MAX_EVENTS = 50;

export function usePoolEvents(poolAddresses: string[]) {
  const [events, setEvents] = useState<PoolSwapEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(true);

  const fetchEvents = useCallback(async () => {
    if (!poolAddresses.length || !HORIZON_URL) return;

    setLoading(true);
    try {
      const newEvents: PoolSwapEvent[] = [];

      for (const poolAddr of poolAddresses) {
        const url = `${HORIZON_URL}/accounts/${poolAddr}/transactions?order=desc&limit=10`;
        const res = await fetch(url);
        if (!res.ok) continue;

        const data = (await res.json()) as HorizonTransactionsResponse;
        for (const tx of data._embedded.records) {
          newEvents.push({
            id: tx.id,
            type: "swap",
            poolAddress: poolAddr,
            txHash: tx.hash,
            ledger: tx.ledger,
            timestamp: tx.created_at,
            data: { memo: tx.memo },
          });
        }
      }

      if (newEvents.length > 0) {
        setEvents((prev) => {
          const seen = new Set(prev.map((e) => e.id));
          const fresh = newEvents.filter((e) => !seen.has(e.id));
          return [...fresh, ...prev].slice(0, MAX_EVENTS);
        });
      }
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [poolAddresses]);

  const refetch = useCallback(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    activeRef.current = true;

    const poll = async () => {
      if (!activeRef.current) return;
      await fetchEvents();
      if (activeRef.current) {
        timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    poll();

    return () => {
      activeRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fetchEvents]);

  return { events, loading, error, refetch };
}
