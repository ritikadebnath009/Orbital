import {
  TransactionBuilder,
  Networks,
  Operation,
  Asset,
  BASE_FEE,
  Horizon,
} from "@stellar/stellar-sdk";
import { HORIZON_URL, NETWORK, TokenInfo } from "./stellar";

const horizon = new Horizon.Server(HORIZON_URL);

export interface TrustlineStatus {
  token: TokenInfo;
  hasTrustline: boolean;
}

export async function checkTrustlines(
  accountAddress: string,
  tokens: TokenInfo[]
): Promise<TrustlineStatus[]> {
  const tokensWithIssuer = tokens.filter((t) => t.issuer);
  if (tokensWithIssuer.length === 0) return tokens.map((t) => ({ token: t, hasTrustline: true }));

  try {
    const account = await horizon.loadAccount(accountAddress);
    const balances = account.balances as Horizon.HorizonApi.BalanceLine[];

    return tokens.map((token) => {
      if (!token.issuer) return { token, hasTrustline: true };
      const has = balances.some(
        (b) =>
          b.asset_type !== "native" &&
          (b as Horizon.HorizonApi.BalanceLineAsset).asset_code === token.symbol &&
          (b as Horizon.HorizonApi.BalanceLineAsset).asset_issuer === token.issuer
      );
      return { token, hasTrustline: has };
    });
  } catch {
    return tokens.map((t) => ({ token: t, hasTrustline: false }));
  }
}

export async function buildTrustlineTransaction(
  accountAddress: string,
  tokens: TokenInfo[]
): Promise<string> {
  const account = await horizon.loadAccount(accountAddress);
  const networkPassphrase = NETWORK === "testnet" ? Networks.TESTNET : Networks.PUBLIC;

  const builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  });

  for (const token of tokens) {
    if (!token.issuer) continue;
    builder.addOperation(
      Operation.changeTrust({
        asset: new Asset(token.symbol, token.issuer),
      })
    );
  }

  const tx = builder.setTimeout(300).build();
  return tx.toXDR();
}
