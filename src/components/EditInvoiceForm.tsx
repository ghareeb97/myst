"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

type EditInvoiceFormProps = {
  invoiceId: string;
  initialCustomerName: string | null;
  initialCustomerPhone: string | null;
  initialReferenceNumber: string | null;
  initialInvoiceDate: string | null;
};

export function EditInvoiceForm({
  invoiceId,
  initialCustomerName,
  initialCustomerPhone,
  initialReferenceNumber,
  initialInvoiceDate
}: EditInvoiceFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [customerName, setCustomerName] = useState(initialCustomerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(
    initialCustomerPhone ?? ""
  );
  const [referenceNumber, setReferenceNumber] = useState(
    initialReferenceNumber ?? ""
  );
  const [invoiceDate, setInvoiceDate] = useState(initialInvoiceDate ?? "");

  async function handleSave() {
    setLoading(true);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName || null,
          customerPhone: customerPhone || null,
          referenceNumber: referenceNumber || null,
          invoiceDate: invoiceDate || null
        })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Failed to save.");
      toast.success("Invoice updated.");
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
      <button className="btn sm" type="button" onClick={() => setOpen(true)}>
        Edit Info
      </button>

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
            aria-labelledby="edit-invoice-title"
          >
            <h2 id="edit-invoice-title" style={{ marginBottom: 16 }}>
              Edit Invoice Info
            </h2>
            <div className="stack">
              <div className="field">
                <label htmlFor="edit-invoice-date">Invoice Date</label>
                <input
                  id="edit-invoice-date"
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="edit-customer-name">Customer Name</label>
                <input
                  id="edit-customer-name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="field">
                <label htmlFor="edit-customer-phone">Customer Phone</label>
                <input
                  id="edit-customer-phone"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="field">
                <label htmlFor="edit-reference">Reference Number</label>
                <input
                  id="edit-reference"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="Optional"
                />
              </div>
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
                className="btn primary"
                type="button"
                onClick={handleSave}
                disabled={loading}
              >
                {loading ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
