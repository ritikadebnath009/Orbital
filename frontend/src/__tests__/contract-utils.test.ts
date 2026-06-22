import { describe, it, expect } from "vitest";
import { calculatePriceImpact } from "@/lib/contract";

const PRECISION = 10_000_000n;

describe("calculatePriceImpact", () => {
  it("returns 0 when spot price is zero", () => {
    expect(calculatePriceImpact(100n * PRECISION, 99n * PRECISION, 0n)).toBe(0);
  });

  it("returns 0 when expected output is zero", () => {
    expect(calculatePriceImpact(0n, 0n, PRECISION)).toBe(0);
  });

  it("returns near-zero impact for a balanced stablecoin pool swap", () => {
    const amountIn = 1_000n * PRECISION;
    const spotPrice = PRECISION; // 1:1 ratio
    // At 1:1, expectedOut = amountIn, actual gets slightly less due to fee
    const amountOut = 9996n * PRECISION / 10000n * 1000n; // ~0.04% fee
    const impact = calculatePriceImpact(amountIn, amountOut, spotPrice);
    expect(impact).toBeGreaterThanOrEqual(0);
    expect(impact).toBeLessThan(1); // sub-1% for small stablecoin swap
  });

  it("returns higher impact for large swaps relative to pool", () => {
    const amountIn = 1_000_000n * PRECISION;
    const spotPrice = PRECISION;
    const amountOut = 950_000n * PRECISION; // 5% slippage
    const impact = calculatePriceImpact(amountIn, amountOut, spotPrice);
    expect(impact).toBeGreaterThan(1); // >1% impact on a large swap
  });

  it("impact is percentage (not basis points)", () => {
    const amountIn = 100n * PRECISION;
    const spotPrice = PRECISION;
    const amountOut = 99n * PRECISION; // 1% slippage
    const impact = calculatePriceImpact(amountIn, amountOut, spotPrice);
    expect(impact).toBeGreaterThan(0.5);
    expect(impact).toBeLessThan(2);
  });
});
