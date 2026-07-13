"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, Wallet, Droplets, ShieldCheck, ArrowLeftRight } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { useTrustlines } from "@/hooks/useTrustlines";
import { onboarding } from "@/lib/onboarding";

interface Step {
  key: string;
  label: string;
  done: boolean;
  icon: typeof Wallet;
}

/**
 * First-time onboarding checklist. The README's "Demo Walkthrough" documents
 * a 4-step manual flow (connect wallet -> get testnet tokens -> enable
 * trustlines -> swap) that a new visitor otherwise has to read to discover.
 * This surfaces the same steps in-app and tracks real progress instead of
 * being a static tutorial.
 */
export function GettingStarted() {
  const { isConnected, connect, address } = useWallet();
  const { missingTokens, loading: trustlinesLoading } = useTrustlines(address);
  const [dismissed, setDismissed] = useState(true); // default hidden until mounted, avoids SSR flash
  const [funded, setFunded] = useState(false);
  const [swapped, setSwapped] = useState(false);

  useEffect(() => {
    setDismissed(onboarding.isDismissed());
    setFunded(onboarding.hasFunded());
    setSwapped(onboarding.hasSwapped());
  }, []);

  // Pick up flags set elsewhere in the app (e.g. after a successful faucet
  // request or swap) without requiring a full page reload.
  useEffect(() => {
    const id = setInterval(() => {
      setFunded(onboarding.hasFunded());
      setSwapped(onboarding.hasSwapped());
    }, 2000);
    return () => clearInterval(id);
  }, []);

  const trustlinesReady = isConnected && !trustlinesLoading && missingTokens.length === 0;

  const steps: Step[] = [
    { key: "connect", label: "Connect your wallet", done: isConnected, icon: Wallet },
    { key: "fund", label: "Get testnet tokens", done: funded, icon: Droplets },
    { key: "trust", label: "Enable tokens in wallet", done: trustlinesReady, icon: ShieldCheck },
    { key: "swap", label: "Make your first swap", done: swapped, icon: ArrowLeftRight },
  ];

  const allDone = steps.every((s) => s.done);

  if (dismissed || allDone) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        className="glass-card rounded-2xl p-5 mb-6 relative"
      >
        <button
          onClick={() => {
            onboarding.dismiss();
            setDismissed(true);
          }}
          className="absolute top-4 right-4 text-white/30 hover:text-white/70 transition-colors"
          aria-label="Dismiss getting started checklist"
        >
          <X className="w-4 h-4" />
        </button>

        <p className="text-xs font-semibold tracking-widest uppercase mb-4" style={{ color: "#b599e5" }}>
          Getting Started
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {steps.map((step) => (
            <div
              key={step.key}
              className="flex flex-col items-start gap-2 p-3 rounded-xl"
              style={{
                background: step.done ? "rgba(74,222,128,0.08)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${step.done ? "rgba(74,222,128,0.25)" : "rgba(255,255,255,0.06)"}`,
              }}
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{
                  background: step.done ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.06)",
                }}
              >
                {step.done ? (
                  <Check className="w-3.5 h-3.5" style={{ color: "#4ade80" }} />
                ) : (
                  <step.icon className="w-3.5 h-3.5 text-white/40" />
                )}
              </div>
              <span className={`text-xs font-medium ${step.done ? "text-white/50 line-through" : "text-white/80"}`}>
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {!isConnected && (
          <button onClick={connect} className="btn-primary mt-4 px-4 py-2 rounded-xl text-sm">
            Connect Wallet to Start
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
