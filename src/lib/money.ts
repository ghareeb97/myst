import type { PaymentStatus } from "@/lib/types";

export function toMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function derivePaymentStatus(
  paidAmount: number,
  total: number
): PaymentStatus {
  if (paidAmount <= 0) return "unpaid";
  if (paidAmount >= total) return "paid";
  return "partially_paid";
}

export function calculateTotals(input: {
  subtotal: number;
  discount?: number;
  paidAmount?: number | null;
}) {
  const subtotal = toMoney(input.subtotal);
  const discount = toMoney(input.discount ?? 0);
  const total = toMoney(Math.max(0, subtotal - discount));

  const paidAmount =
    input.paidAmount == null ? total : toMoney(Math.max(0, input.paidAmount));

  if (paidAmount > total) {
    throw new Error("Paid amount cannot exceed total amount.");
  }

  const remainingAmount = toMoney(total - paidAmount);
  const paymentStatus = derivePaymentStatus(paidAmount, total);

  return {
    subtotal,
    discount,
    total,
    paidAmount,
    remainingAmount,
    paymentStatus
  };
}
