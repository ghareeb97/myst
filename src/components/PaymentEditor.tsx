"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";
import { useToast } from "@/components/Toast";

type PaymentEditorProps = {
  invoiceId: string;
  total: number;
  paidAmount: number;
};

type PaymentStatus = "paid" | "partially_paid" | "unpaid";

function deriveStatus(paid: number, total: number): PaymentStatus {
  if (paid <= 0) return "unpaid";
  if (paid >= total) return "paid";
  return "partially_paid";
}

const STATUS_CLASS: Record<PaymentStatus, string> = {
  paid: "chip success",
  partially_paid: "chip warning",
  unpaid: "chip danger"
};

export function PaymentEditor({
  invoiceId,
  total,
  paidAmount: initialPaidAmount
}: PaymentEditorProps) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState(initialPaidAmount.toString());

  const [optimisticPaid, setOptimisticPaid] = useOptimistic(initialPaidAmount);
  const optimisticStatus = deriveStatus(optimisticPaid, total);

  function save() {
    const newPaid = Number(inputValue);
    setError(null);

    startTransition(async () => {
      setOptimisticPaid(newPaid);
      try {
        const response = await fetch(`/api/invoices/${invoiceId}/payment`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paidAmount: newPaid })
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Failed to update payment.");
        toast.success("Payment updated.");
        router.refresh();
      } catch (saveError) {
        const message =
          saveError instanceof Error ? saveError.message : "Unexpected error.";
        toast.error(message);
        setError(message);
      }
    });
  }

  return (
    <div className="card stack">
      <h3>Update Payment</h3>
      <p className="help-text">
        Adjust paid amount up to the invoice total of {formatCurrency(total)}.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="muted caption">Current status:</span>
        <span className={STATUS_CLASS[optimisticStatus]}>{optimisticStatus}</span>
      </div>
      <div className="field">
        <label htmlFor="paidAmountEdit">Paid Amount</label>
        <input
          id="paidAmountEdit"
          type="number"
          min={0}
          max={total}
          step="0.01"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
        />
      </div>
      {error ? <p className="danger">{error}</p> : null}
      <button
        className="btn primary"
        disabled={isPending}
        onClick={save}
        type="button"
      >
        {isPending ? "Saving..." : "Save Payment"}
      </button>
    </div>
  );
}
