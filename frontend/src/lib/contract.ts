"use client";
import {
  rpc as SorobanRpc,
  TransactionBuilder,
  Contract,
  Keypair,
  Address,
  nativeToScVal,
  scValToNative,
  xdr,
  BASE_FEE,
} from "@stellar/stellar-sdk";
import { sorobanRpc as rpc, NETWORK_PASSPHRASE, PRECISION } from "./stellar";
import { server, networkPassphrase } from "./stellar-sdk";
import { friendlyContractError, ContractType } from "./contractErrors";

// The primary contract address used by this app (factory by default).
// Individual callers may pass any contract ID to callContractFunction.
export const CONTRACT_ID = process.env.NEXT_PUBLIC_FACTORY_ADDRESS || "";

export type SignFn = (xdr: string, networkPassphrase: string) => Promise<string>;

// Call a read-only contract function (no signing needed)
export async function simulateContractCall(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  contractType: ContractType = "pool"
): Promise<unknown> {
  // Deterministic read-only keypair derived from fixed seed — never used to sign real transactions
  const dummyKp = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 0x42));
  const dummySource = dummyKp.publicKey();
  const account = await rpc.getAccount(dummySource).catch(() => ({
    accountId: () => dummySource,
    sequenceNumber: () => "0",
    incrementSequenceNumber: () => {},
  }));

  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(account as never, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(friendlyContractError(sim.error ?? "", contractType));
  }
  const result = (sim as SorobanRpc.Api.SimulateTransactionSuccessResponse)
    .result;
  if (!result) return null;
  return scValToNative(result.retval);
}

// ── Pool read functions ───────────────────────────────────────────────────────

export async function getReserves(
  poolAddress: string
): Promise<[bigint, bigint]> {
  const result = (await simulateContractCall(poolAddress, "get_reserves", [])) as [
    bigint,
    bigint
  ];
  return result;
}

export async function getSwapSimulation(
  poolAddress: string,
  tokenIn: string,
  amountIn: bigint
): Promise<{ amountOut: bigint; fee: bigint }> {
  const args = [
    new Address(tokenIn).toScVal(),
    nativeToScVal(amountIn, { type: "i128" }),
  ];
  const result = (await simulateContractCall(
    poolAddress,
    "get_swap_result",
    args
  )) as [bigint, bigint];
  return { amountOut: result[0], fee: result[1] };
}

export async function getVirtualPrice(poolAddress: string): Promise<bigint> {
  return (await simulateContractCall(
    poolAddress,
    "get_virtual_price",
    []
  )) as bigint;
}

export async function getUserShares(
  poolAddress: string,
  userAddress: string
): Promise<bigint> {
  const args = [new Address(userAddress).toScVal()];
  return (await simulateContractCall(
    poolAddress,
    "get_user_shares",
    args
  )) as bigint;
}

export async function getTotalShares(poolAddress: string): Promise<bigint> {
  return (await simulateContractCall(
    poolAddress,
    "get_total_shares",
    []
  )) as bigint;
}

export async function getAmp(poolAddress: string): Promise<bigint> {
  return (await simulateContractCall(poolAddress, "get_amp", [])) as bigint;
}

export async function getFeeBps(poolAddress: string): Promise<number> {
  return ((await simulateContractCall(poolAddress, "get_fee_bps", [])) as number) ?? 0;
}

// ── Price impact calculation ──────────────────────────────────────────────────

export function calculatePriceImpact(
  amountIn: bigint,
  amountOut: bigint,
  spotPrice: bigint
): number {
  if (spotPrice === 0n) return 0;
  const expectedOut = (amountIn * spotPrice) / PRECISION;
  if (expectedOut === 0n) return 0;
  const impact = ((expectedOut - amountOut) * 10000n) / expectedOut;
  return Number(impact) / 100; // percentage
}

// ── Transaction execution ─────────────────────────────────────────────────────

async function executeContractTx(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  userAddress: string,
  sign: SignFn,
  contractType: ContractType = "pool"
): Promise<unknown> {
  const account = await rpc.getAccount(userAddress);
  const contract = new Contract(contractId);

  const tx = new TransactionBuilder(account, {
    fee: String(Number(BASE_FEE) * 10), // bump fee for Soroban
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  const sim = await rpc.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    const msg = (sim as SorobanRpc.Api.SimulateTransactionErrorResponse).error;
    throw new Error(friendlyContractError(msg, contractType));
  }

  const assembled = SorobanRpc.assembleTransaction(tx, sim).build();
  const signedXdr = await sign(assembled.toXDR(), NETWORK_PASSPHRASE);
  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

  const sendResult = await rpc.sendTransaction(signedTx);
  if (sendResult.status === "ERROR") {
    const msg = sendResult.errorResult?.toString() ?? "unknown";
    throw new Error(friendlyContractError(msg, contractType));
  }

  const hash = sendResult.hash;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const result = await rpc.getTransaction(hash);
    if (result.status === "SUCCESS") {
      const success = result as SorobanRpc.Api.GetSuccessfulTransactionResponse;
      if (success.returnValue) return scValToNative(success.returnValue);
      return null;
    }
    if (result.status === "FAILED") {
      throw new Error("Transaction failed on-chain — check your balance, slippage tolerance, and trustlines.");
    }
  }
  throw new Error("Transaction confirmation timeout — it may still confirm; check your wallet history.");
}

export async function executeSwap(
  poolAddress: string,
  userAddress: string,
  tokenIn: string,
  amountIn: bigint,
  minAmountOut: bigint,
  sign: SignFn
): Promise<void> {
  const args = [
    new Address(userAddress).toScVal(),
    new Address(tokenIn).toScVal(),
    nativeToScVal(amountIn, { type: "i128" }),
    nativeToScVal(minAmountOut, { type: "i128" }),
  ];
  await executeContractTx(poolAddress, "swap", args, userAddress, sign);
}

export async function executeAddLiquidity(
  poolAddress: string,
  userAddress: string,
  amountA: bigint,
  amountB: bigint,
  minShares: bigint,
  sign: SignFn
): Promise<void> {
  const args = [
    new Address(userAddress).toScVal(),
    nativeToScVal(amountA, { type: "i128" }),
    nativeToScVal(amountB, { type: "i128" }),
    nativeToScVal(minShares, { type: "i128" }),
  ];
  await executeContractTx(poolAddress, "add_liquidity", args, userAddress, sign);
}

export async function executeRemoveLiquidity(
  poolAddress: string,
  userAddress: string,
  shares: bigint,
  minAmountA: bigint,
  minAmountB: bigint,
  sign: SignFn
): Promise<void> {
  const args = [
    new Address(userAddress).toScVal(),
    nativeToScVal(shares, { type: "i128" }),
    nativeToScVal(minAmountA, { type: "i128" }),
    nativeToScVal(minAmountB, { type: "i128" }),
  ];
  await executeContractTx(poolAddress, "remove_liquidity", args, userAddress, sign);
}

// ── Router read/write ─────────────────────────────────────────────────────────

export interface RouteInfo {
  hops: number;
  tokens: string[];
  pools: string[];
  expectedOut: bigint;
  priceImpactBps: number;
}

export interface RouterQuote {
  amountOut: bigint;
  route: RouteInfo;
}

export async function getRouterQuote(
  routerAddress: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint
): Promise<RouterQuote> {
  const args = [
    new Address(tokenIn).toScVal(),
    new Address(tokenOut).toScVal(),
    nativeToScVal(amountIn, { type: "i128" }),
  ];
  const raw = (await simulateContractCall(routerAddress, "get_quote", args, "router")) as {
    amount_out: bigint;
    price_impact_bps: bigint;
    route: { hops: number; tokens: unknown[]; pools: unknown[]; expected_out: bigint };
  };
  // scValToNative may return Address objects or strings depending on SDK version
  const coerceAddr = (v: unknown): string =>
    typeof v === "string" ? v : (v as { toString(): string }).toString();
  return {
    amountOut: BigInt(raw.amount_out),
    route: {
      hops: Number(raw.route.hops),
      tokens: raw.route.tokens.map(coerceAddr),
      pools: raw.route.pools.map(coerceAddr),
      expectedOut: BigInt(raw.route.expected_out),
      priceImpactBps: Number(raw.price_impact_bps),
    },
  };
}

export async function executeRouterSwap(
  routerAddress: string,
  userAddress: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: bigint,
  minAmountOut: bigint,
  deadlineLedger: number,
  sign: SignFn
): Promise<void> {
  const args = [
    new Address(userAddress).toScVal(),
    new Address(tokenIn).toScVal(),
    new Address(tokenOut).toScVal(),
    nativeToScVal(amountIn, { type: "i128" }),
    nativeToScVal(minAmountOut, { type: "i128" }),
    nativeToScVal(deadlineLedger, { type: "u32" }),
  ];
  await executeContractTx(routerAddress, "swap", args, userAddress, sign, "router");
}

// ── Factory read ──────────────────────────────────────────────────────────────

export async function getFactoryAllPools(factoryAddress: string): Promise<string[]> {
  const raw = ((await simulateContractCall(factoryAddress, "get_all_pools", [], "factory")) as unknown[]) ?? [];
  return raw.map((v) => (typeof v === "string" ? v : (v as { toString(): string }).toString()));
}

export async function getFactoryPool(
  factoryAddress: string,
  tokenA: string,
  tokenB: string
): Promise<string | null> {
  const args = [new Address(tokenA).toScVal(), new Address(tokenB).toScVal()];
  const result = await simulateContractCall(factoryAddress, "get_pool", args, "factory");
  if (!result) return null;
  return typeof result === "string" ? result : (result as { toString(): string }).toString();
}

export async function executeCreatePool(
  factoryAddress: string,
  creatorAddress: string,
  tokenA: string,
  tokenB: string,
  amp: number,
  feeBps: number,
  sign: SignFn
): Promise<string> {
  const args = [
    new Address(creatorAddress).toScVal(),
    new Address(tokenA).toScVal(),
    new Address(tokenB).toScVal(),
    nativeToScVal(amp, { type: "u64" }),
    nativeToScVal(feeBps, { type: "u32" }),
  ];
  const result = await executeContractTx(factoryAddress, "create_pool", args, creatorAddress, sign, "factory");
  const addr = result as string;
  return typeof addr === "string" ? addr : (addr as { toString(): string }).toString();
}

export async function getPoolTokens(
  poolAddress: string
): Promise<[string, string]> {
  const result = await simulateContractCall(poolAddress, "get_tokens", []);
  const raw = result as [unknown, unknown];
  const coerce = (v: unknown) => (typeof v === "string" ? v : (v as { toString(): string }).toString());
  return [coerce(raw[0]), coerce(raw[1])];
}

// ── Token balance ─────────────────────────────────────────────────────────────

export async function getTokenBalance(
  tokenAddress: string,
  userAddress: string
): Promise<bigint> {
  const args = [new Address(userAddress).toScVal()];
  return ((await simulateContractCall(tokenAddress, "balance", args)) as bigint) ?? 0n;
}

// ── Ledger sequence (for deadline calculation) ────────────────────────────────

export async function getCurrentLedger(): Promise<number> {
  const info = await rpc.getLatestLedger();
  return info.sequence;
}

// ── Classic (non-Soroban) transaction submission via Horizon ─────────────────
// Used for trustline setup (ChangeTrust operations) which are classic ops.

export async function submitClassicXdr(signedXdr: string): Promise<void> {
  const { Horizon, TransactionBuilder } = await import("@stellar/stellar-sdk");
  const { HORIZON_URL, NETWORK_PASSPHRASE } = await import("./stellar");
  const server = new Horizon.Server(HORIZON_URL);
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const result = await server.submitTransaction(tx);
  if (!result.hash) throw new Error("Transaction submission failed");
}

// ── Generic contract invocation (signs with a raw secret key) ─────────────────
// Used by server-side scripts and deployment tooling where a wallet signer is
// not available and the caller holds the secret key directly.

export async function callContractFunction(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  signerSecret: string
): Promise<unknown> {
  const keypair = Keypair.fromSecret(signerSecret);
  const account = await server.getAccount(keypair.publicKey());

  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(account, {
    fee: String(Number(BASE_FEE) * 10),
    networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${(sim as SorobanRpc.Api.SimulateTransactionErrorResponse).error}`);
  }

  const assembled = SorobanRpc.assembleTransaction(tx, sim).build();
  assembled.sign(keypair);

  const sendResult = await server.sendTransaction(assembled);
  if (sendResult.status === "ERROR") {
    throw new Error(`Submit failed: ${sendResult.errorResult?.toString() ?? "unknown"}`);
  }

  const hash = sendResult.hash;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const txResult = await server.getTransaction(hash);
    if (txResult.status === "SUCCESS") {
      const success = txResult as SorobanRpc.Api.GetSuccessfulTransactionResponse;
      if (success.returnValue) return scValToNative(success.returnValue);
      return null;
    }
    if (txResult.status === "FAILED") throw new Error("Transaction failed on-chain");
  }
  throw new Error("Transaction confirmation timeout");
}
