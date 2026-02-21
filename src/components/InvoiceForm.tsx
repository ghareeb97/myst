"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/format";

type ProductOption = {
  id: string;
  name: string;
  sku: string;
  sale_price: number;
  current_stock: number;
};

type InvoiceFormProps = {
  products: ProductOption[];
};

type LineItem = {
  productId: string;
  quantity: number;
};

export function InvoiceForm({ products }: InvoiceFormProps) {
  const router = useRouter();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [discount, setDiscount] = useState("0");
  const [paidAmount, setPaidAmount] = useState("");
  const [items, setItems] = useState<LineItem[]>([
    { productId: products[0]?.id ?? "", quantity: 1 }
  ]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) return sum;
      return sum + product.sale_price * item.quantity;
    }, 0);
  }, [items, products]);

  const total = Math.max(0, subtotal - Number(discount || 0));
  const effectivePaidAmount =
    paidAmount === "" ? total : Math.max(0, Number(paidAmount));

  function addRow() {
    setItems((prev) => [...prev, { productId: products[0]?.id ?? "", quantity: 1 }]);
  }

  function removeRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRow(index: number, next: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...next } : line))
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const validItems = items.filter((item) => item.productId && item.quantity > 0);
      if (validItems.length === 0) {
        throw new Error("Invoice requires at least one valid line item.");
      }

      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName || null,
          customerPhone: customerPhone || null,
          referenceNumber: referenceNumber || null,
          discount: Number(discount || 0),
          paidAmount: paidAmount === "" ? null : Number(paidAmount),
          items: validItems
        })
      });

      const data = (await response.json()) as { error?: string; id?: string };
      if (!response.ok || !data.id) {
        throw new Error(data.error ?? "Failed to create invoice.");
      }

      setSuccess(true);
      setTimeout(() => {
        router.replace(`/dashboard/invoices/${data.id}`);
        router.refresh();
      }, 500);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unexpected error."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="stack card" onSubmit={handleSubmit}>
      <div className="grid cols-2">
        <div className="field">
          <label htmlFor="customerName">Customer Name (optional)</label>
          <input
            id="customerName"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="customerPhone">Customer Phone (optional)</label>
          <input
            id="customerPhone"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="referenceNumber">Reference Number (optional)</label>
        <input
          id="referenceNumber"
          value={referenceNumber}
          onChange={(e) => setReferenceNumber(e.target.value)}
          placeholder="e.g. PO-1234, order ref, external ID"
        />
      </div>

      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text-strong)", marginBottom: 12 }}>
          Line Items
        </legend>
        <div className="stack">
          {/* Column headers */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 90px 110px 40px",
            gap: "var(--space-3)",
            paddingBottom: 4,
            borderBottom: "1px solid var(--border-soft)"
          }}>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)" }}>Product</span>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)" }}>Qty</span>
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)" }}>Total</span>
            <span />
          </div>

          {items.map((item, index) => {
            const product = products.find((p) => p.id === item.productId);
            const lineTotal = product ? product.sale_price * item.quantity : 0;
            return (
              <div
                key={`${item.productId}-${index}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 90px 110px 40px",
                  gap: "var(--space-3)",
                  alignItems: "start"
                }}
              >
                <div className="field" style={{ gap: 4 }}>
                  <select
                    value={item.productId}
                    onChange={(e) => updateRow(index, { productId: e.target.value })}
                    required
                    aria-label="Product"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku}) — {formatCurrency(p.sale_price)}
                      </option>
                    ))}
                  </select>
                  {product ? (
                    <small className="muted">Stock: {product.current_stock}</small>
                  ) : null}
                </div>
                <div className="field" style={{ gap: 4 }}>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={item.quantity}
                    onChange={(e) =>
                      updateRow(index, { quantity: Number(e.target.value || 1) })
                    }
                    required
                    aria-label="Quantity"
                  />
                </div>
                <div style={{ height: 42, display: "flex", alignItems: "center", fontSize: "0.9rem", fontWeight: 600, color: "var(--text-strong)" }}>
                  {formatCurrency(lineTotal)}
                </div>
                <button
                  className="btn sm"
                  type="button"
                  onClick={() => removeRow(index)}
                  disabled={items.length === 1}
                  aria-label="Remove row"
                  style={{ padding: "0 10px", minHeight: 42, opacity: items.length === 1 ? 0.3 : 1 }}
                >
                  ×
                </button>
              </div>
            );
          })}
          <button className="btn sm" type="button" onClick={addRow} style={{ alignSelf: "start" }}>
            + Add product
          </button>
        </div>
      </fieldset>

      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text-strong)", marginBottom: 12 }}>
          Payment
        </legend>
        <div className="stack">
          <div className="field">
            <label htmlFor="paidAmount">Paid Amount (default full total)</label>
            <input
              id="paidAmount"
              type="number"
              min={0}
              step="0.01"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
            />
          </div>

          <details className="form-advanced">
            <summary className="form-advanced__trigger">Add Discount</summary>
            <div className="form-advanced__body">
              <div className="field">
                <label htmlFor="discount">Discount</label>
                <input
                  id="discount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </div>
            </div>
          </details>

          <div className="card" style={{ padding: "12px 16px", display: "grid", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", color: "var(--text-muted)" }}>
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {Number(discount || 0) > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", color: "var(--text-muted)" }}>
                <span>Discount</span>
                <span>− {formatCurrency(Number(discount))}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.95rem", fontWeight: 700, color: "var(--text-strong)", borderTop: "1px solid var(--border-soft)", paddingTop: 6 }}>
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", color: "var(--text-muted)" }}>
              <span>Paid</span>
              <span>{formatCurrency(Math.min(effectivePaidAmount, total))}</span>
            </div>
          </div>
        </div>
      </fieldset>

      {error ? <p className="danger">{error}</p> : null}

      <button className="btn primary" type="submit" disabled={loading || success}>
        {success ? "✓ Invoice Created" : loading ? "Saving..." : "Confirm Invoice"}
      </button>
    </form>
  );
}
