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
};

type InvoiceFormProps = {
  products: ProductOption[];
  canDiscount: boolean;
};

type LineItem = {
  productId: string;
  quantity: number;
};

function resetForm(products: ProductOption[]) {
  return {
    customerName: "",
    customerPhone: "",
    referenceNumber: "",
    invoiceDate: todayInCairo(),
    discount: "0",
    paidAmount: "",
    items: [{ productId: products[0]?.id ?? "", quantity: 1 }] as LineItem[],
    addonQss: false,
    addonQssPrice: "20",
    addonPs: false,
    addonPsPrice: ""
  };
}

export function InvoiceForm({ products, canDiscount }: InvoiceFormProps) {
  const router = useRouter();

  const initial = resetForm(products);
  const [customerName, setCustomerName] = useState(initial.customerName);
  const [customerPhone, setCustomerPhone] = useState(initial.customerPhone);
  const [referenceNumber, setReferenceNumber] = useState(initial.referenceNumber);
  const [invoiceDate, setInvoiceDate] = useState(initial.invoiceDate);
  const [discount, setDiscount] = useState(initial.discount);
  const [paidAmount, setPaidAmount] = useState(initial.paidAmount);
  const [items, setItems] = useState<LineItem[]>(initial.items);
  const [addonQss, setAddonQss] = useState(initial.addonQss);
  const [addonQssPrice, setAddonQssPrice] = useState(initial.addonQssPrice);
  const [addonPs, setAddonPs] = useState(initial.addonPs);
  const [addonPsPrice, setAddonPsPrice] = useState(initial.addonPsPrice);
  const [loading, setLoading] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [createdNumber, setCreatedNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const itemsSubtotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) return sum;
      return sum + product.sale_price * item.quantity;
    }, 0);
  }, [items, products]);

  const qssAmount = addonQss ? Math.max(0, Number(addonQssPrice || 0)) : 0;
  const psAmount  = addonPs  ? Math.max(0, Number(addonPsPrice  || 0)) : 0;
  const subtotal  = itemsSubtotal + qssAmount + psAmount;
  const total     = Math.max(0, subtotal - Number(discount || 0));
  const effectivePaidAmount = paidAmount === "" ? total : Math.max(0, Number(paidAmount));

  function addRow() {
    setItems((prev) => [...prev, { productId: products[0]?.id ?? "", quantity: 1 }]);
  }

  function removeRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRow(index: number, next: Partial<LineItem>) {
    setItems((prev) => prev.map((line, i) => (i === index ? { ...line, ...next } : line)));
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
      const validItems = items.filter((item) => item.productId && item.quantity > 0);

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
          addonQss: addonQss && addonQssPrice !== "" ? Math.max(0, Number(addonQssPrice)) : null,
          addonPs:  addonPs  && addonPsPrice  !== "" ? Math.max(0, Number(addonPsPrice))  : null,
          items: validItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity
          }))
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
      setError(submitError instanceof Error ? submitError.message : "Unexpected error.");
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
    setAddonQss(fresh.addonQss);
    setAddonQssPrice(fresh.addonQssPrice);
    setAddonPs(fresh.addonPs);
    setAddonPsPrice(fresh.addonPsPrice);
    setCreatedId(null);
    setCreatedNumber(null);
    setError(null);
  }

  // ── Success state ───────────────────────────────────────────────────────────
  if (createdId) {
    return (
      <div className="card stack" style={{ textAlign: "center", padding: "var(--space-7)" }}>
        <div style={{ fontSize: "2.5rem", lineHeight: 1, color: "var(--success-500)" }}>✓</div>
        <div>
          <p style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--text-strong)", margin: 0 }}>
            Invoice Created
          </p>
          {createdNumber ? (
            <p className="muted" style={{ margin: "4px 0 0" }}>{createdNumber}</p>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "center", flexWrap: "wrap" }}>
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

  // ── Confirmation modal summary ──────────────────────────────────────────────
  const confirmItems = items
    .filter((item) => item.productId && item.quantity > 0)
    .map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) return null;
      return {
        name: product.name,
        quantity: item.quantity,
        price: product.sale_price,
        lineTotal: product.sale_price * item.quantity
      };
    })
    .filter(Boolean) as { name: string; quantity: number; price: number; lineTotal: number }[];

  return (
    <>
      <form className="stack card" onSubmit={handleFormSubmit}>
        {/* ── Date + Customer ── */}
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
          <legend style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text-strong)", marginBottom: 12 }}>
            Line Items
          </legend>
          <div className="stack">
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
                  key={index}
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
                    {product && !product.is_digital ? (
                      <small className="muted">Stock: {product.current_stock}</small>
                    ) : product?.is_digital ? (
                      <small className="muted">Digital</small>
                    ) : null}
                  </div>
                  <div className="field" style={{ gap: 4 }}>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={item.quantity}
                      onChange={(e) => updateRow(index, { quantity: Number(e.target.value || 1) })}
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

        {/* ── Add-ons ── */}
        <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text-strong)", marginBottom: 12 }}>
            Add-ons
          </legend>
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            {/* QSS */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-4)",
              padding: "10px 14px",
              background: addonQss ? "rgba(79,70,229,0.05)" : "var(--surface-2)",
              borderRadius: "var(--radius-sm)",
              border: addonQss ? "1px solid rgba(79,70,229,0.2)" : "1px solid var(--border-soft)"
            }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }}>
                <input
                  type="checkbox"
                  checked={addonQss}
                  onChange={(e) => setAddonQss(e.target.checked)}
                />
                <span style={{ fontWeight: 600, fontSize: "0.92rem" }}>QSS</span>
                <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Quick Service System</span>
              </label>
              {addonQss && (
                <div className="field" style={{ margin: 0, width: 110 }}>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={addonQssPrice}
                    onChange={(e) => setAddonQssPrice(e.target.value)}
                    placeholder="Price"
                    aria-label="QSS price"
                    autoFocus
                  />
                </div>
              )}
              {addonQss && addonQssPrice !== "" && (
                <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-strong)", minWidth: 70, textAlign: "right" }}>
                  {formatCurrency(qssAmount)}
                </span>
              )}
            </div>

            {/* PS */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-4)",
              padding: "10px 14px",
              background: addonPs ? "rgba(79,70,229,0.05)" : "var(--surface-2)",
              borderRadius: "var(--radius-sm)",
              border: addonPs ? "1px solid rgba(79,70,229,0.2)" : "1px solid var(--border-soft)"
            }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1 }}>
                <input
                  type="checkbox"
                  checked={addonPs}
                  onChange={(e) => setAddonPs(e.target.checked)}
                />
                <span style={{ fontWeight: 600, fontSize: "0.92rem" }}>PS</span>
                <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>Photoshop Edit</span>
              </label>
              {addonPs && (
                <div className="field" style={{ margin: 0, width: 110 }}>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={addonPsPrice}
                    onChange={(e) => setAddonPsPrice(e.target.value)}
                    placeholder="Enter price"
                    aria-label="PS price"
                    autoFocus
                  />
                </div>
              )}
              {addonPs && addonPsPrice !== "" && (
                <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-strong)", minWidth: 70, textAlign: "right" }}>
                  {formatCurrency(psAmount)}
                </span>
              )}
            </div>
          </div>
        </fieldset>

        {/* ── Payment ── */}
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

            {canDiscount ? (
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
            ) : null}

            <div className="card" style={{ padding: "12px 16px", display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", color: "var(--text-muted)" }}>
                <span>Items</span>
                <span>{formatCurrency(itemsSubtotal)}</span>
              </div>
              {addonQss && qssAmount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", color: "var(--text-muted)" }}>
                  <span>QSS</span>
                  <span>{formatCurrency(qssAmount)}</span>
                </div>
              )}
              {addonPs && psAmount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", color: "var(--text-muted)" }}>
                  <span>PS</span>
                  <span>{formatCurrency(psAmount)}</span>
                </div>
              )}
              {Number(discount || 0) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", color: "var(--text-muted)" }}>
                  <span>Discount</span>
                  <span>− {formatCurrency(Number(discount))}</span>
                </div>
              )}
              <div style={{
                display: "flex", justifyContent: "space-between",
                fontSize: "0.95rem", fontWeight: 700, color: "var(--text-strong)",
                borderTop: "1px solid var(--border-soft)", paddingTop: 6
              }}>
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

        <button className="btn primary" type="submit" disabled={loading}>
          Review & Confirm
        </button>
      </form>

      {/* ── Confirmation Modal ── */}
      {showConfirm ? (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setShowConfirm(false); }}
        >
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            style={{ maxWidth: 480 }}
          >
            <h2 id="confirm-title" style={{ marginBottom: 4 }}>Confirm Invoice</h2>
            {(customerName || invoiceDate) && (
              <div style={{ display: "grid", gap: 4, marginBottom: 12, fontSize: "0.88rem", color: "var(--text-muted)" }}>
                {invoiceDate && <span>Date: {invoiceDate}</span>}
                {customerName && <span>Customer: {customerName}</span>}
                {referenceNumber && <span>Ref: {referenceNumber}</span>}
              </div>
            )}

            <div className="table-wrap" style={{ marginBottom: 12 }}>
              <table className="responsive-table" style={{ fontSize: "0.88rem" }}>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th style={{ textAlign: "right" }}>Qty</th>
                    <th style={{ textAlign: "right" }}>Price</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {confirmItems.map((ci, i) => (
                    <tr key={i}>
                      <td>{ci.name}</td>
                      <td data-label="Qty" style={{ textAlign: "right" }}>{ci.quantity}</td>
                      <td data-label="Price" style={{ textAlign: "right" }}>{formatCurrency(ci.price)}</td>
                      <td data-label="Total" style={{ textAlign: "right" }}>{formatCurrency(ci.lineTotal)}</td>
                    </tr>
                  ))}
                  {addonQss && qssAmount > 0 && (
                    <tr>
                      <td>QSS – Quick Service System</td>
                      <td style={{ textAlign: "right" }}>—</td>
                      <td style={{ textAlign: "right" }}>—</td>
                      <td style={{ textAlign: "right" }}>{formatCurrency(qssAmount)}</td>
                    </tr>
                  )}
                  {addonPs && psAmount > 0 && (
                    <tr>
                      <td>PS – Photoshop Edit</td>
                      <td style={{ textAlign: "right" }}>—</td>
                      <td style={{ textAlign: "right" }}>—</td>
                      <td style={{ textAlign: "right" }}>{formatCurrency(psAmount)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{
              display: "grid", gap: 6, padding: "10px 14px",
              background: "var(--surface-2)", borderRadius: "var(--radius-sm)",
              fontSize: "0.9rem", marginBottom: 16
            }}>
              {Number(discount || 0) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)" }}>
                  <span>Discount</span>
                  <span>− {formatCurrency(Number(discount))}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "var(--text-strong)" }}>
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)" }}>
                <span>Paid</span>
                <span>{formatCurrency(Math.min(effectivePaidAmount, total))}</span>
              </div>
              {total - Math.min(effectivePaidAmount, total) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--danger-500)" }}>
                  <span>Remaining</span>
                  <span>{formatCurrency(total - Math.min(effectivePaidAmount, total))}</span>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn" type="button" onClick={() => setShowConfirm(false)} disabled={loading}>
                Back
              </button>
              <button className="btn primary" type="button" onClick={handleConfirmedSubmit} disabled={loading}>
                {loading ? "Creating..." : "Confirm Invoice"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
