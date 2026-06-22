"use client";
import { useState, useEffect, useCallback } from "react";
import {
  isConnected,
  isAllowed,
  getAddress,
  signTransaction,
  setAllowed,
} from "@stellar/freighter-api";

export interface WalletState {
  isConnected: boolean;
  isLoading: boolean;
  address: string | null;
  error: string | null;
}

export function useWallet() {
  const [state, setState] = useState<WalletState>({
    isConnected: false,
    isLoading: true,
    address: null,
    error: null,
  });

  const checkConnection = useCallback(async () => {
    try {
      const connected = await isConnected();
      if (!connected) {
        setState({ isConnected: false, isLoading: false, address: null, error: null });
        return;
      }
      const allowed = await isAllowed();
      if (!allowed) {
        setState({ isConnected: false, isLoading: false, address: null, error: null });
        return;
      }
      const { address } = await getAddress();
      setState({ isConnected: true, isLoading: false, address, error: null });
    } catch (err) {
      setState({
        isConnected: false,
        isLoading: false,
        address: null,
        error: (err as Error).message,
      });
    }
  }, []);

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const connect = useCallback(async () => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      await setAllowed();
      const { address } = await getAddress();
      setState({ isConnected: true, isLoading: false, address, error: null });
    } catch (err) {
      setState((s) => ({
        ...s,
        isLoading: false,
        error: (err as Error).message,
      }));
    }
  }, []);

  const disconnect = useCallback(() => {
    setState({ isConnected: false, isLoading: false, address: null, error: null });
  }, []);

  const sign = useCallback(
    async (xdr: string, networkPassphrase: string): Promise<string> => {
      if (!state.address) throw new Error("Wallet not connected");
      const result = await signTransaction(xdr, {
        networkPassphrase,
        address: state.address,
      });
      if (result.error) throw new Error(result.error.message ?? "Failed to sign transaction");
      if (!result.signedTxXdr) throw new Error("Freighter returned empty signed transaction");
      return result.signedTxXdr;
    },
    [state.address]
  );

  return { ...state, connect, disconnect, sign };
}
