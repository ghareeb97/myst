"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { orderStatusLabel } from "@/lib/orders";
import type { OrderStatus } from "@/lib/types";

type OrderActionsProps = {
  orderId: string;
  orderCode: string;
  total: number;
  deliveryMethod: "pickup" | "delivery";
  nextStatuses: OrderStatus[];
  canConfirm: boolean;
};

export function OrderActions({ orderId, orderCode, total, deliveryMethod, nextStatuses, canConfirm }: OrderActionsProps) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [paidInFull, setPaidInFull] = useState(true);
  const [paidAmount, setPaidAmount] = useState("0");

  async function post(url: string, body: unknown, key: string, success: string) {
    setBusy(key);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Request failed.");
      toast.success(success);
      router.refresh();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unexpected error.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function changeStatus(status: OrderStatus) {
    if (status === "cancelled" && !window.confirm(`Cancel order ${orderCode}?`)) return;
    await post(`/api/orders/${orderId}/status`, { status }, status, `${orderCode}: ${orderStatusLabel(status, deliveryMethod)}`);
  }

  async function confirmInvoice() {
    const amount = paidInFull ? null : Number(paidAmount);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      toast.error("Enter a valid paid amount.");
      return;
    }
    const ok = await post(`/api/orders/${orderId}/confirm`, { paidAmount: amount }, "confirm", `${orderCode} invoiced.`);
    if (ok) setConfirmOpen(false);
  }

  if (!nextStatuses.length && !canConfirm) return null;

  return (
    <section className="card stack reveal">
      <h2>Actions</h2>
      <div className="order-actions">
        {nextStatuses
          .filter((s) => s !== "cancelled")
          .map((s) => (
            <button key={s} type="button" className="btn primary" disabled={busy !== null} onClick={() => changeStatus(s)}>
              {busy === s ? "Saving..." : `Mark ${orderStatusLabel(s, deliveryMethod).toLowerCase()}`}
            </button>
          ))}
        {canConfirm ? (
          <button type="button" className="btn" disabled={busy !== null} onClick={() => setConfirmOpen(true)}>
            Confirm → invoice
          </button>
        ) : null}
        {nextStatuses.includes("cancelled") ? (
          <button type="button" className="btn danger" disabled={busy !== null} onClick={() => changeStatus("cancelled")}>
            {busy === "cancelled" ? "Cancelling..." : "Cancel order"}
          </button>
        ) : null}
      </div>

      {/* Portal to <body>: the parent card's .reveal animation creates a stacking context that would put later cards above the modal. */}
      {confirmOpen ? createPortal(
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmOpen(false);
          }}
        >
          <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="confirm-order-title">
            <div>
              <h2 id="confirm-order-title" style={{ marginBottom: 8 }}>
                Create invoice for {orderCode}?
              </h2>
              <p className="help-text">
                Creates a normal invoice with the order code as its reference number, priced from the current product
                prices. Prints and online gifts are digital products by default, so they don&apos;t change stock.
              </p>
            </div>
            <div className="field">
              <label>
                <input type="checkbox" checked={paidInFull} onChange={(e) => setPaidInFull(e.target.checked)} /> Paid in
                full ({new Intl.NumberFormat("en-US", { style: "currency", currency: "EGP" }).format(total)})
              </label>
            </div>
            {!paidInFull ? (
              <div className="field">
                <label htmlFor="paid-amount">Amount paid now (EGP)</label>
                <input
                  id="paid-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                />
              </div>
            ) : null}
            <div className="modal-actions">
              <button className="btn" type="button" onClick={() => setConfirmOpen(false)} disabled={busy !== null}>
                Cancel
              </button>
              <button className="btn primary" type="button" onClick={confirmInvoice} disabled={busy !== null}>
                {busy === "confirm" ? "Creating..." : "Create invoice"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </section>
  );
}
