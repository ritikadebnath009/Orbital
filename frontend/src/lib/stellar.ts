import {
  rpc as SorobanRpc,
  TransactionBuilder,
  Networks,
  Address,
  nativeToScVal,
  scValToNative,
  xdr,
  BASE_FEE,
  Contract,
} from "@stellar/stellar-sdk";

export const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK as "testnet" | "mainnet";
export const RPC_URL = process.env.NEXT_PUBLIC_STELLAR_RPC_URL!;
export const NETWORK_PASSPHRASE =
  NETWORK === "testnet" ? Networks.TESTNET : Networks.PUBLIC;

export const PRECISION = 10_000_000n; // 1e7 strobes = 1 token

export function toStrobes(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  const fracPadded = frac.padEnd(7, "0").slice(0, 7);
  return BigInt(whole) * PRECISION + BigInt(fracPadded);
}

export function fromStrobes(strobes: bigint | string, decimals = 7): string {
  const s = BigInt(strobes);
  const prec = BigInt(10 ** decimals);
  const whole = s / prec;
  const frac = s % prec;
  return `${whole}.${frac.toString().padStart(decimals, "0")}`;
}

export function formatAmount(strobes: bigint | string, dp = 6): string {
  const raw = fromStrobes(strobes);
  const [whole, frac] = raw.split(".");
  return `${Number(whole).toLocaleString()}.${frac.slice(0, dp)}`;
}

export const HORIZON_URL = process.env.NEXT_PUBLIC_HORIZON_URL || "https://horizon-testnet.stellar.org";
export const sorobanRpc = new SorobanRpc.Server(RPC_URL, { allowHttp: false });

export interface PoolConfig {
  address: string;
  tokenA: string;
  tokenB: string;
  symbolA: string;
  symbolB: string;
}

export const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS || "";
export const ROUTER_ADDRESS = process.env.NEXT_PUBLIC_ROUTER_ADDRESS || "";

export const POOLS: PoolConfig[] = [
  {
    address: process.env.NEXT_PUBLIC_POOL_USDT_XLM || "",
    tokenA: process.env.NEXT_PUBLIC_USDT_ADDRESS || "",
    tokenB: process.env.NEXT_PUBLIC_XLM_ADDRESS || "",
    symbolA: "USDT",
    symbolB: "XLM",
  },
  {
    address: process.env.NEXT_PUBLIC_POOL_USDT_EURC || "",
    tokenA: process.env.NEXT_PUBLIC_USDT_ADDRESS || "",
    tokenB: process.env.NEXT_PUBLIC_EURC_ADDRESS || "",
    symbolA: "USDT",
    symbolB: "EURC",
  },
  {
    address: process.env.NEXT_PUBLIC_POOL_USDC_XLM || "",
    tokenA: process.env.NEXT_PUBLIC_USDC_ADDRESS || "",
    tokenB: process.env.NEXT_PUBLIC_XLM_ADDRESS || "",
    symbolA: "USDC",
    symbolB: "XLM",
  },
].filter((p) => p.address && p.tokenA && p.tokenB);

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  issuer?: string; // undefined for native XLM — no trustline needed
}

export const KNOWN_TOKENS: TokenInfo[] = [
  {
    address: process.env.NEXT_PUBLIC_USDT_ADDRESS || "",
    symbol: "USDT",
    name: "Tether USD",
    issuer: process.env.NEXT_PUBLIC_USDT_ISSUER,
  },
  {
    address: process.env.NEXT_PUBLIC_XLM_ADDRESS || "",
    symbol: "XLM",
    name: "Stellar Lumens",
  },
  {
    address: process.env.NEXT_PUBLIC_USDC_ADDRESS || "",
    symbol: "USDC",
    name: "USD Coin",
    issuer: process.env.NEXT_PUBLIC_USDC_ISSUER,
  },
  {
    address: process.env.NEXT_PUBLIC_EURC_ADDRESS || "",
    symbol: "EURC",
    name: "Euro Coin",
    issuer: process.env.NEXT_PUBLIC_EURC_ISSUER,
  },
].filter((t) => t.address);

export function tokenSymbol(address: string): string {
  return KNOWN_TOKENS.find((t) => t.address === address)?.symbol ?? address.slice(0, 6) + "…";
}
