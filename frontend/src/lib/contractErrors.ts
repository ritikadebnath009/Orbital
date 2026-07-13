// Human-readable messages for the Soroban contract error codes defined in
// contracts/{stable_pool,pool_factory,router}/src/{errors.rs,lib.rs}.
//
// Previously the frontend surfaced raw "Error(Contract, #6)" strings to
// users (or, worse, applied the router's error table to every contract
// regardless of which one actually raised the error — a pool's
// InsufficientLiquidity, code 6, would render as the router's "Invalid
// amount"). Keep these tables in sync with the Rust `#[contracterror]` enums.

export type ContractType = "pool" | "factory" | "router";

const POOL_ERRORS: Record<number, string> = {
  1: "Pool is already initialized",
  2: "Pool is not initialized",
  3: "Invalid amplification coefficient",
  4: "Invalid fee",
  5: "Amount must be greater than zero",
  6: "Not enough liquidity in the pool for this trade",
  7: "Slippage tolerance exceeded — try increasing your slippage tolerance",
  8: "That token isn't part of this pool",
  9: "Cannot swap a token for itself",
  10: "Insufficient balance",
  11: "This pool is currently paused",
  12: "Not authorized to perform this action",
  13: "Amount too large — would overflow",
  14: "Pool invariant check failed",
  15: "Amount is below the pool's minimum reserve",
  16: "Price calculation did not converge — try a smaller amount",
  17: "Invalid LP share amount",
  18: "Amplification ramp is changing too fast",
  19: "Ramp time must be in the future",
  20: "Invalid protocol fee",
  21: "No protocol fee recipient configured",
  22: "The first deposit into a new pool requires both tokens",
  23: "First deposit is below the minimum required amount",
  24: "No pending admin change to accept",
  25: "Upgrade timelock has not expired yet (48h after proposal)",
  26: "No pending upgrade to execute",
};

const FACTORY_ERRORS: Record<number, string> = {
  1: "Factory is already initialized",
  2: "Factory is not initialized",
  3: "A pool for this token pair already exists",
  4: "Pool not found",
  5: "Invalid token pair",
  6: "Not authorized to perform this action",
  7: "Invalid amplification coefficient",
  8: "Invalid fee",
  9: "No pending admin change to accept",
  10: "Upgrade timelock has not expired yet (48h after proposal)",
  11: "No pending upgrade to execute",
};

const ROUTER_ERRORS: Record<number, string> = {
  1: "Router is already initialized",
  2: "Router is not initialized",
  3: "No route found for this token pair",
  4: "Slippage tolerance exceeded — try increasing your slippage tolerance",
  5: "Amount must be greater than zero",
  6: "Transaction deadline has passed — try again",
  7: "Invalid tokens for this route",
};

const ERROR_MAPS: Record<ContractType, Record<number, string>> = {
  pool: POOL_ERRORS,
  factory: FACTORY_ERRORS,
  router: ROUTER_ERRORS,
};

/**
 * Extracts a Soroban `Error(Contract, #N)` code from a host error message
 * and maps it to a human-readable string for the given contract type. Falls
 * back to the original message when no error code is present, and to a
 * generic "Contract error #N" when the code isn't in the table.
 */
export function friendlyContractError(message: string, contractType: ContractType): string {
  const match = message.match(/Error\(Contract,\s*#(\d+)\)/);
  if (!match) return message;
  const code = Number(match[1]);
  return ERROR_MAPS[contractType][code] ?? `Contract error #${code}`;
}
