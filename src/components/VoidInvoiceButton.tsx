"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function VoidInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleVoid() {
    const confirmed = window.confirm(
      "Void this invoice? Stock will be restored automatically."
    );
    if (!confirmed) return;

    const reason = window.prompt("Reason for void (optional):") ?? null;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Failed to void invoice.");
      router.refresh();
    } catch (voidError) {
      setError(voidError instanceof Error ? voidError.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card stack">
      <h3>Void Invoice</h3>
      <p className="help-text">
        This action will restore stock movements and mark the invoice as void.
      </p>
      {error ? <p className="danger">{error}</p> : null}
      <button
        className="btn danger"
        disabled={loading}
        onClick={handleVoid}
        type="button"
      >
        {loading ? "Voiding..." : "Void Invoice"}
      </button>
    </div>
  );
}
