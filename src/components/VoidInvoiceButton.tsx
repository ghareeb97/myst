"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

type VoidInvoiceButtonProps = {
  invoiceId: string;
  invoiceNumber: string;
};

export function VoidInvoiceButton({ invoiceId, invoiceNumber }: VoidInvoiceButtonProps) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || null })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Failed to void invoice.");
      toast.success(`Invoice ${invoiceNumber} voided successfully.`);
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <details className="danger-zone">
        <summary className="danger-zone__trigger">Void Invoice</summary>
        <div className="danger-zone__body">
          <p className="help-text">
            Voiding restores all stock movements and marks the invoice as void. This
            cannot be undone.
          </p>
          <button
            className="btn danger"
            type="button"
            onClick={() => setOpen(true)}
          >
            Void Invoice
          </button>
        </div>
      </details>

      {open ? (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="void-title">
            <div className="modal-icon modal-icon--danger" aria-hidden="true">⚠</div>
            <div>
              <h2 id="void-title" style={{ marginBottom: 8 }}>
                Void {invoiceNumber}?
              </h2>
              <p className="help-text">
                Stock for all line items will be restored. The invoice will be
                permanently marked as void and cannot be confirmed again.
              </p>
            </div>
            <div className="field">
              <label htmlFor="void-reason">Reason (optional)</label>
              <textarea
                id="void-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Customer cancellation"
              />
            </div>
            <div className="modal-actions">
              <button
                className="btn"
                type="button"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                className="btn danger"
                type="button"
                onClick={handleConfirm}
                disabled={loading}
              >
                {loading ? "Voiding..." : "Confirm Void"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
