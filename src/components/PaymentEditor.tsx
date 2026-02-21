"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";

type PaymentEditorProps = {
  invoiceId: string;
  total: number;
  paidAmount: number;
};

export function PaymentEditor({
  invoiceId,
  total,
  paidAmount: initialPaidAmount
}: PaymentEditorProps) {
  const router = useRouter();
  const [paidAmount, setPaidAmount] = useState(initialPaidAmount.toString());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/payment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidAmount: Number(paidAmount) })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Failed to update payment.");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card stack">
      <h3>Update Payment</h3>
      <p className="help-text">
        Adjust paid amount up to the invoice total of {formatCurrency(total)}.
      </p>
      <div className="field">
        <label htmlFor="paidAmountEdit">Paid Amount</label>
        <input
          id="paidAmountEdit"
          type="number"
          min={0}
          max={total}
          step="0.01"
          value={paidAmount}
          onChange={(e) => setPaidAmount(e.target.value)}
        />
      </div>
      {error ? <p className="danger">{error}</p> : null}
      <button className="btn primary" disabled={loading} onClick={save} type="button">
        {loading ? "Saving..." : "Save Payment"}
      </button>
    </div>
  );
}
