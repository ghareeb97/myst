"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

type DeleteInvoiceButtonProps = {
  invoiceId: string;
  invoiceNumber: string;
};

export function DeleteInvoiceButton({
  invoiceId,
  invoiceNumber
}: DeleteInvoiceButtonProps) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}`, {
        method: "DELETE"
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Failed to delete invoice.");
      toast.success(`Invoice ${invoiceNumber} deleted.`);
      router.push("/dashboard/invoices");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unexpected error.");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <details className="danger-zone">
        <summary className="danger-zone__trigger">Delete Invoice</summary>
        <div className="danger-zone__body">
          <p className="help-text">
            Permanently deletes the invoice. If confirmed, stock will be
            restored automatically. This cannot be undone.
          </p>
          <button
            className="btn danger"
            type="button"
            onClick={() => setOpen(true)}
          >
            Delete Invoice
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
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <div className="modal-icon modal-icon--danger" aria-hidden="true">
              ⚠
            </div>
            <div>
              <h2 id="delete-title" style={{ marginBottom: 8 }}>
                Delete {invoiceNumber}?
              </h2>
              <p className="help-text">
                This will permanently delete the invoice and restore any stock.
                This action cannot be undone.
              </p>
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
                onClick={handleDelete}
                disabled={loading}
              >
                {loading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
