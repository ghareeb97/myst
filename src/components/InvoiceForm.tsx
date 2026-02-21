"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, todayInCairo } from "@/lib/format";

type ProductOption = {
  id: string;
  name: string;
  sku: string;
  sale_price: number;
  current_stock: number;
  is_digital: boolean;
  allow_price_override: boolean;
};

type InvoiceFormProps = {
  products: ProductOption[];
};

type LineItem = {
  productId: string;
  quantity: number;
  customPrice: string; // empty string = use product price
};

function resetForm(products: ProductOption[]): {
  customerName: string;
  customerPhone: string;
  referenceNumber: string;
  invoiceDate: string;
  discount: string;
  paidAmount: string;
  items: LineItem[];
} {
  return {
    customerName: "",
    customerPhone: "",
    referenceNumber: "",
    invoiceDate: todayInCairo(),
    discount: "0",
    paidAmount: "",
    items: [{ productId: products[0]?.id ?? "", quantity: 1, customPrice: "" }]
  };
}

export function InvoiceForm({ products }: InvoiceFormProps) {
  const router = useRouter();

  const initial = resetForm(products);
  const [customerName, setCustomerName] = useState(initial.customerName);
  const [customerPhone, setCustomerPhone] = useState(initial.customerPhone);
  const [referenceNumber, setReferenceNumber] = useState(initial.referenceNumber);
  const [invoiceDate, setInvoiceDate] = useState(initial.invoiceDate);
  const [discount, setDiscount] = useState(initial.discount);
  const [paidAmount, setPaidAmount] = useState(initial.paidAmount);
  const [items, setItems] = useState<LineItem[]>(initial.items);
  const [loading, setLoading] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [createdNumber, setCreatedNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) return sum;
      const price =
        product.allow_price_override && item.customPrice !== ""
          ? Math.max(0, Number(item.customPrice))
          : product.sale_price;
      return sum + price * item.quantity;
    }, 0);
  }, [items, products]);

  const total = Math.max(0, subtotal - Number(discount || 0));
  const effectivePaidAmount =
    paidAmount === "" ? total : Math.max(0, Number(paidAmount));

  function addRow() {
    setItems((prev) => [
      ...prev,
      { productId: products[0]?.id ?? "", quantity: 1, customPrice: "" }
    ]);
  }

  function removeRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRow(index: number, next: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...next } : line))
    );
  }

  function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const valid = items.filter((item) => item.productId && item.quantity > 0);
    if (valid.length === 0) {
      setError("Invoice requires at least one valid line item.");
      return;
    }
    setError(null);
    setShowConfirm(true);
  }

  async function handleConfirmedSubmit() {
    setLoading(true);
    setError(null);
    try {
      const validItems = items.filter(
        (item) => item.productId && item.quantity > 0
      );

      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName || null,
          customerPhone: customerPhone || null,
          referenceNumber: referenceNumber || null,
          invoiceDate: invoiceDate || null,
          discount: Number(discount || 0),
          paidAmount: paidAmount === "" ? null : Number(paidAmount),
          items: validItems.map((item) => {
            const product = products.find((p) => p.id === item.productId);
            const hasOverride =
              product?.allow_price_override && item.customPrice !== "";
            return {
              productId: item.productId,
              quantity: item.quantity,
              ...(hasOverride
                ? { customPrice: Math.max(0, Number(item.customPrice)) }
                : {})
            };
          })
        })
      });

      const data = (await response.json()) as {
        error?: string;
        id?: string;
        invoice_number?: string;
      };
      if (!response.ok || !data.id) {
        throw new Error(data.error ?? "Failed to create invoice.");
      }

      setCreatedId(data.id);
      setCreatedNumber(data.invoice_number ?? null);
      setShowConfirm(false);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unexpected error."
      );
      setShowConfirm(false);
    } finally {
      setLoading(false);
    }
  }

  function handleCreateAnother() {
    const fresh = resetForm(products);
    setCustomerName(fresh.customerName);
    setCustomerPhone(fresh.customerPhone);
    setReferenceNumber(fresh.referenceNumber);
    setInvoiceDate(fresh.invoiceDate);
    setDiscount(fresh.discount);
    setPaidAmount(fresh.paidAmount);
    setItems(fresh.items);
    setCreatedId(null);
    setCreatedNumber(null);
    setError(null);
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (createdId) {
    return (
      <div
        className="card stack"
        style={{ textAlign: "center", padding: "var(--space-7)" }}
      >
        <div
          style={{
            fontSize: "2.5rem",
            lineHeight: 1,
            color: "var(--success-500)"
          }}
        >
          ✓
        </div>
        <div>
          <p
            style={{
              fontWeight: 700,
              fontSize: "1.1rem",
              color: "var(--text-strong)",
              margin: 0
            }}
          >
            Invoice Created
          </p>
          {createdNumber ? (
            <p className="muted" style={{ margin: "4px 0 0" }}>
              {createdNumber}
            </p>
          ) : null}
        </div>
        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            justifyContent: "center",
            flexWrap: "wrap"
          }}
        >
          <button
            className="btn primary"
            type="button"
            onClick={() => router.push(`/dashboard/invoices/${createdId}`)}
          >
            View Invoice
          </button>
          <button className="btn" type="button" onClick={handleCreateAnother}>
            New Invoice
          </button>
        </div>
      </div>
    );
  }

  // ── Line items summary for confirmation modal ─────────────────────────────
  const confirmItems = items
    .filter((item) => item.productId && item.quantity > 0)
    .map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) return null;
      const price =
        product.allow_price_override && item.customPrice !== ""
          ? Math.max(0, Number(item.customPrice))
          : product.sale_price;
      return {
        name: product.name,
        quantity: item.quantity,
        price,
        lineTotal: price * item.quantity
      };
    })
    .filter(Boolean) as {
    name: string;
    quantity: number;
    price: number;
    lineTotal: number;
  }[];

  return (
    <>
      <form className="stack card" onSubmit={handleFormSubmit}>
        {/* ── Customer ── */}
        <div className="field">
          <label htmlFor="invoiceDate">Invoice Date</label>
          <input
            id="invoiceDate"
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            required
          />
        </div>
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

        {/* ── Line Items ── */}
        <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
          <legend
            style={{
              fontWeight: 700,
              fontSize: "1.05rem",
              color: "var(--text-strong)",
              marginBottom: 12
            }}
          >
            Line Items
          </legend>
          <div className="stack">
            {/* Column headers */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 90px 120px 40px",
                gap: "var(--space-3)",
                paddingBottom: 4,
                borderBottom: "1px solid var(--border-soft)"
              }}
            >
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--text-muted)"
                }}
              >
                Product
              </span>
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--text-muted)"
                }}
              >
                Qty
              </span>
              <span
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--text-muted)"
                }}
              >
                Price / Total
              </span>
              <span />
            </div>

            {items.map((item, index) => {
              const product = products.find((p) => p.id === item.productId);
              const effectivePrice =
                product?.allow_price_override && item.customPrice !== ""
                  ? Math.max(0, Number(item.customPrice))
                  : (product?.sale_price ?? 0);
              const lineTotal = product ? effectivePrice * item.quantity : 0;
              return (
                <div
                  key={index}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 90px 120px 40px",
                    gap: "var(--space-3)",
                    alignItems: "start"
                  }}
                >
                  <div className="field" style={{ gap: 4 }}>
                    <select
                      value={item.productId}
                      onChange={(e) =>
                        updateRow(index, {
                          productId: e.target.value,
                          customPrice: ""
                        })
                      }
                      required
                      aria-label="Product"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                          {p.is_digital ? " ·digital" : ""}
                        </option>
                      ))}
                    </select>
                    {product && !product.is_digital ? (
                      <small className="muted">
                        Stock: {product.current_stock}
                      </small>
                    ) : product?.is_digital ? (
                      <small className="muted">Digital — no stock</small>
                    ) : null}
                  </div>
                  <div className="field" style={{ gap: 4 }}>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={item.quantity}
                      onChange={(e) =>
                        updateRow(index, {
                          quantity: Number(e.target.value || 1)
                        })
                      }
                      required
                      aria-label="Quantity"
                    />
                  </div>
                  <div className="field" style={{ gap: 4 }}>
                    {product?.allow_price_override ? (
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder={`Default: ${product.sale_price > 0 ? product.sale_price : "—"}`}
                        value={item.customPrice}
                        onChange={(e) =>
                          updateRow(index, { customPrice: e.target.value })
                        }
                        aria-label="Custom price"
                      />
                    ) : (
                      <div
                        style={{
                          height: 42,
                          display: "flex",
                          alignItems: "center",
                          fontSize: "0.9rem",
                          fontWeight: 600,
                          color: "var(--text-strong)"
                        }}
                      >
                        {formatCurrency(lineTotal)}
                      </div>
                    )}
                    {product?.allow_price_override && item.customPrice !== "" ? (
                      <small className="muted">
                        = {formatCurrency(lineTotal)}
                      </small>
                    ) : null}
                  </div>
                  <button
                    className="btn sm"
                    type="button"
                    onClick={() => removeRow(index)}
                    disabled={items.length === 1}
                    aria-label="Remove row"
                    style={{
                      padding: "0 10px",
                      minHeight: 42,
                      opacity: items.length === 1 ? 0.3 : 1
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            <button
              className="btn sm"
              type="button"
              onClick={addRow}
              style={{ alignSelf: "start" }}
            >
              + Add product
            </button>
          </div>
        </fieldset>

        {/* ── Payment ── */}
        <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
          <legend
            style={{
              fontWeight: 700,
              fontSize: "1.05rem",
              color: "var(--text-strong)",
              marginBottom: 12
            }}
          >
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

            <div
              className="card"
              style={{ padding: "12px 16px", display: "grid", gap: 6 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.88rem",
                  color: "var(--text-muted)"
                }}
              >
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {Number(discount || 0) > 0 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.88rem",
                    color: "var(--text-muted)"
                  }}
                >
                  <span>Discount</span>
                  <span>− {formatCurrency(Number(discount))}</span>
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  color: "var(--text-strong)",
                  borderTop: "1px solid var(--border-soft)",
                  paddingTop: 6
                }}
              >
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "0.88rem",
                  color: "var(--text-muted)"
                }}
              >
                <span>Paid</span>
                <span>
                  {formatCurrency(Math.min(effectivePaidAmount, total))}
                </span>
              </div>
            </div>
          </div>
        </fieldset>

        {error ? <p className="danger">{error}</p> : null}

        <button
          className="btn primary"
          type="submit"
          disabled={loading}
        >
          {loading ? "Saving..." : "Review & Confirm"}
        </button>
      </form>

      {/* ── Confirmation Modal ── */}
      {showConfirm ? (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowConfirm(false);
          }}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            style={{ maxWidth: 480 }}
          >
            <h2 id="confirm-title" style={{ marginBottom: 4 }}>
              Confirm Invoice
            </h2>
            {(customerName || invoiceDate) && (
              <div
                style={{
                  display: "grid",
                  gap: 4,
                  marginBottom: 12,
                  fontSize: "0.88rem",
                  color: "var(--text-muted)"
                }}
              >
                {invoiceDate && <span>Date: {invoiceDate}</span>}
                {customerName && <span>Customer: {customerName}</span>}
                {referenceNumber && <span>Ref: {referenceNumber}</span>}
              </div>
            )}

            {/* Items table */}
            <div className="table-wrap" style={{ marginBottom: 12 }}>
              <table
                className="responsive-table"
                style={{ fontSize: "0.88rem" }}
              >
                <thead>
                  <tr>
                    <th>Product</th>
                    <th style={{ textAlign: "right" }}>Qty</th>
                    <th style={{ textAlign: "right" }}>Price</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {confirmItems.map((ci, i) => (
                    <tr key={i}>
                      <td>{ci.name}</td>
                      <td
                        data-label="Qty"
                        style={{ textAlign: "right" }}
                      >
                        {ci.quantity}
                      </td>
                      <td
                        data-label="Price"
                        style={{ textAlign: "right" }}
                      >
                        {formatCurrency(ci.price)}
                      </td>
                      <td
                        data-label="Total"
                        style={{ textAlign: "right" }}
                      >
                        {formatCurrency(ci.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div
              style={{
                display: "grid",
                gap: 6,
                padding: "10px 14px",
                background: "var(--surface-2)",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.9rem",
                marginBottom: 16
              }}
            >
              {Number(discount || 0) > 0 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: "var(--text-muted)"
                  }}
                >
                  <span>Discount</span>
                  <span>− {formatCurrency(Number(discount))}</span>
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontWeight: 700,
                  color: "var(--text-strong)"
                }}
              >
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  color: "var(--text-muted)"
                }}
              >
                <span>Paid</span>
                <span>
                  {formatCurrency(Math.min(effectivePaidAmount, total))}
                </span>
              </div>
              {total - Math.min(effectivePaidAmount, total) > 0 && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: "var(--danger-500)"
                  }}
                >
                  <span>Remaining</span>
                  <span>
                    {formatCurrency(
                      total - Math.min(effectivePaidAmount, total)
                    )}
                  </span>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button
                className="btn"
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={loading}
              >
                Back
              </button>
              <button
                className="btn primary"
                type="button"
                onClick={handleConfirmedSubmit}
                disabled={loading}
              >
                {loading ? "Creating..." : "Confirm Invoice"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
