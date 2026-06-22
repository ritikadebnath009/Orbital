import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
    env: {
      NEXT_PUBLIC_STELLAR_NETWORK: "testnet",
      NEXT_PUBLIC_STELLAR_RPC_URL: "https://soroban-testnet.stellar.org",
      NEXT_PUBLIC_HORIZON_URL: "https://horizon-testnet.stellar.org",
      NEXT_PUBLIC_FACTORY_ADDRESS: "",
      NEXT_PUBLIC_ROUTER_ADDRESS: "",
      NEXT_PUBLIC_USDC_ADDRESS: "",
      NEXT_PUBLIC_USDT_ADDRESS: "",
      NEXT_PUBLIC_EURC_ADDRESS: "",
      NEXT_PUBLIC_XLM_ADDRESS: "",
    },
    include: ["src/__tests__/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/__tests__/**", "src/app/**/*.tsx"],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
