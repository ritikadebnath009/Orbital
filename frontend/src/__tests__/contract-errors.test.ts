import { describe, it, expect } from "vitest";
import { friendlyContractError } from "@/lib/contractErrors";

describe("friendlyContractError", () => {
  it("maps a pool error code to a human-readable message", () => {
    const msg = "HostError: Error(Contract, #6)\nEvent log ...";
    expect(friendlyContractError(msg, "pool")).toBe(
      "Not enough liquidity in the pool for this trade"
    );
  });

  it("maps the same numeric code differently per contract type", () => {
    // Code 6 means something different on each contract — this is the bug
    // that motivated pulling error tables apart per contract type instead
    // of applying the router's table to every error.
    const msg = "Error(Contract, #6)";
    expect(friendlyContractError(msg, "pool")).toBe(
      "Not enough liquidity in the pool for this trade"
    );
    expect(friendlyContractError(msg, "factory")).toBe(
      "Not authorized to perform this action"
    );
    expect(friendlyContractError(msg, "router")).toBe(
      "Transaction deadline has passed — try again"
    );
  });

  it("falls back to a generic message for an unrecognized code", () => {
    expect(friendlyContractError("Error(Contract, #999)", "pool")).toBe(
      "Contract error #999"
    );
  });

  it("returns the original message when no error code is present", () => {
    const msg = "Network request failed";
    expect(friendlyContractError(msg, "pool")).toBe(msg);
  });
});
