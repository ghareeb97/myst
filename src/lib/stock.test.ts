import { describe, expect, it } from "vitest";
import { isLowStock, resolveLowStockThreshold } from "@/lib/stock";

describe("resolveLowStockThreshold", () => {
  it("uses product threshold when provided", () => {
    expect(
      resolveLowStockThreshold({ productThreshold: 2, globalThreshold: 3 })
    ).toBe(2);
  });

  it("falls back to global threshold", () => {
    expect(
      resolveLowStockThreshold({ productThreshold: null, globalThreshold: 3 })
    ).toBe(3);
  });
});

describe("isLowStock", () => {
  it("flags stock equal to threshold", () => {
    expect(
      isLowStock({ stock: 3, productThreshold: null, globalThreshold: 3 })
    ).toBe(true);
  });

  it("flags negative stock", () => {
    expect(
      isLowStock({ stock: -1, productThreshold: null, globalThreshold: 3 })
    ).toBe(true);
  });

  it("does not flag above threshold", () => {
    expect(
      isLowStock({ stock: 10, productThreshold: 3, globalThreshold: 5 })
    ).toBe(false);
  });
});
