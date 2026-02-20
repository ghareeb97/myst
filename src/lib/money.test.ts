import { describe, expect, it } from "vitest";
import { calculateTotals, derivePaymentStatus } from "@/lib/money";

describe("derivePaymentStatus", () => {
  it("returns unpaid when paid amount is 0", () => {
    expect(derivePaymentStatus(0, 100)).toBe("unpaid");
  });

  it("returns partially_paid when paid amount is between 0 and total", () => {
    expect(derivePaymentStatus(25, 100)).toBe("partially_paid");
  });

  it("returns paid when paid amount equals total", () => {
    expect(derivePaymentStatus(100, 100)).toBe("paid");
  });
});

describe("calculateTotals", () => {
  it("defaults paid amount to total", () => {
    const result = calculateTotals({ subtotal: 100, discount: 10 });
    expect(result.total).toBe(90);
    expect(result.paidAmount).toBe(90);
    expect(result.remainingAmount).toBe(0);
    expect(result.paymentStatus).toBe("paid");
  });

  it("computes partially paid status", () => {
    const result = calculateTotals({
      subtotal: 200,
      discount: 0,
      paidAmount: 120
    });
    expect(result.total).toBe(200);
    expect(result.remainingAmount).toBe(80);
    expect(result.paymentStatus).toBe("partially_paid");
  });

  it("throws when paid amount exceeds total", () => {
    expect(() =>
      calculateTotals({ subtotal: 100, discount: 0, paidAmount: 120 })
    ).toThrow("Paid amount cannot exceed total amount.");
  });
});
