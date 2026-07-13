// Best-effort address -> symbol resolution for known testnet tokens. Used
// wherever we need a human-readable label for a token address returned from
// a contract call (pool registration, seeding) since neither the pools nor
// the factory contracts store token symbols on-chain.
const KNOWN_SYMBOLS: Record<string, string> = {
  [process.env.USDC_ADDRESS ?? ""]: "USDC",
  [process.env.USDT_ADDRESS ?? ""]: "USDT",
  [process.env.EURC_ADDRESS ?? ""]: "EURC",
  [process.env.XLM_ADDRESS ?? ""]: "XLM",
};

export function tokenSymbol(address: string): string {
  return KNOWN_SYMBOLS[address] ?? address.slice(0, 8);
}
