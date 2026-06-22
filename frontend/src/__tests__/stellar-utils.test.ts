import { describe, it, expect } from "vitest";
import { toStrobes, fromStrobes, formatAmount, tokenSymbol, PRECISION } from "@/lib/stellar";

describe("toStrobes", () => {
  it("converts whole numbers to strobes (1e7 per token)", () => {
    expect(toStrobes("1")).toBe(10_000_000n);
    expect(toStrobes("100")).toBe(1_000_000_000n);
    expect(toStrobes("0")).toBe(0n);
  });

  it("converts decimal amounts correctly", () => {
    expect(toStrobes("1.5")).toBe(15_000_000n);
    expect(toStrobes("0.0000001")).toBe(1n);
    expect(toStrobes("1.1234567")).toBe(11_234_567n);
  });

  it("truncates beyond 7 decimal places", () => {
    expect(toStrobes("1.12345678")).toBe(11_234_567n);
  });

  it("handles large amounts", () => {
    expect(toStrobes("1000000")).toBe(10_000_000_000_000n);
  });
});

describe("fromStrobes", () => {
  it("converts strobes to decimal string", () => {
    expect(fromStrobes(10_000_000n)).toBe("1.0000000");
    expect(fromStrobes(15_000_000n)).toBe("1.5000000");
    expect(fromStrobes(1n)).toBe("0.0000001");
  });

  it("handles zero", () => {
    expect(fromStrobes(0n)).toBe("0.0000000");
  });

  it("handles string input", () => {
    expect(fromStrobes("10000000")).toBe("1.0000000");
  });

  it("round-trips with toStrobes", () => {
    const amounts = ["1", "100", "1.5", "0.0000001"];
    for (const a of amounts) {
      const strobes = toStrobes(a);
      const back = fromStrobes(strobes);
      expect(toStrobes(back)).toBe(strobes);
    }
  });
});

describe("formatAmount", () => {
  it("formats with default 6 decimal places", () => {
    const formatted = formatAmount(10_000_000n);
    expect(formatted).toContain("1");
    expect(formatted.split(".")[1]).toHaveLength(6);
  });

  it("formats large numbers with locale separator", () => {
    const formatted = formatAmount(1_000_000_000_000n, 2);
    expect(formatted).toMatch(/\d/);
  });
});

describe("PRECISION", () => {
  it("equals 10_000_000 (7 decimal places)", () => {
    expect(PRECISION).toBe(10_000_000n);
  });
});

describe("tokenSymbol", () => {
  it("returns abbreviated address for unknown tokens", () => {
    const result = tokenSymbol("GABCDEF1234567890");
    expect(result).toMatch(/GABCDE/);
  });
});
