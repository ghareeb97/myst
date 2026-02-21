"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/format";

export type SalesRow = {
  day: string;
  invoice_count: number;
  revenue: number;
  total_discount: number;
};

export type BestSellerRow = {
  product_id: string;
  product_name: string;
  sku: string;
  qty_sold: number;
  revenue: number;
};

export type ProfitSummary = {
  total_revenue: number;
  costed_revenue: number;
  total_cost: number;
  gross_profit: number;
  uncosted_revenue: number;
};

export type MovementRow = {
  movement_id: string;
  movement_type: "sale" | "void_reversal" | "adjustment";
  quantity_delta: number;
  product_name: string;
  sku: string;
  invoice_number: string | null;
  actor: string;
  note: string | null;
  created_at: string;
};

export type InitialData = {
  salesRows: SalesRow[];
  bestSellers: BestSellerRow[];
  profit: ProfitSummary | null;
  movements: MovementRow[];
  defaultFrom: string;
  defaultTo: string;
};

type Tab = "sales" | "best-sellers" | "profit" | "warehouse";

const TAB_LABELS: Record<Tab, string> = {
  "sales": "Sales",
  "best-sellers": "Best Sellers",
  "profit": "Net Profit",
  "warehouse": "Warehouse"
};

const MOVEMENT_LABELS: Record<MovementRow["movement_type"], string> = {
  sale: "Sale",
  void_reversal: "Void Reversal",
  adjustment: "Adjustment"
};

const MOVEMENT_TONES: Record<MovementRow["movement_type"], string> = {
  sale: "danger",
  void_reversal: "success",
  adjustment: "accent"
};

function formatDay(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function formatTs(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

// ---------- Tab components ----------

function SalesTab({ rows }: { rows: SalesRow[] }) {
  const totals = rows.reduce(
    (acc, r) => ({
      invoices: acc.invoices + Number(r.invoice_count),
      revenue: acc.revenue + Number(r.revenue),
      discount: acc.discount + Number(r.total_discount)
    }),
    { invoices: 0, revenue: 0, discount: 0 }
  );

  if (rows.length === 0) {
    return <div className="empty-state">No sales found for this period.</div>;
  }

  return (
    <div className="table-wrap">
      <table className="responsive-table">
        <thead>
          <tr>
            <th>Date</th>
            <th className="num">Invoices</th>
            <th className="num">Revenue</th>
            <th className="num">Discounts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.day}>
              <td data-label="Date">{formatDay(r.day)}</td>
              <td data-label="Invoices" className="num">{r.invoice_count}</td>
              <td data-label="Revenue" className="num">{formatCurrency(Number(r.revenue))}</td>
              <td data-label="Discounts" className="num">{formatCurrency(Number(r.total_discount))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="totals-row">
            <td><strong>Total</strong></td>
            <td className="num"><strong>{totals.invoices}</strong></td>
            <td className="num"><strong>{formatCurrency(totals.revenue)}</strong></td>
            <td className="num"><strong>{formatCurrency(totals.discount)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function BestSellersTab({ rows }: { rows: BestSellerRow[] }) {
  if (rows.length === 0) {
    return <div className="empty-state">No sales found for this period.</div>;
  }

  return (
    <div className="table-wrap">
      <table className="responsive-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Product</th>
            <th>SKU</th>
            <th className="num">Qty Sold</th>
            <th className="num">Revenue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.product_id}>
              <td data-label="#">{i + 1}</td>
              <td data-label="Product">{r.product_name}</td>
              <td data-label="SKU"><code>{r.sku}</code></td>
              <td data-label="Qty Sold" className="num">{r.qty_sold}</td>
              <td data-label="Revenue" className="num">{formatCurrency(Number(r.revenue))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProfitTab({ summary }: { summary: ProfitSummary | null }) {
  if (!summary) {
    return <div className="empty-state">No data found for this period.</div>;
  }

  const profitMargin =
    summary.costed_revenue > 0
      ? ((summary.gross_profit / summary.costed_revenue) * 100).toFixed(1)
      : null;

  return (
    <div className="profit-grid">
      <div className="profit-card">
        <div className="profit-label">Total Revenue</div>
        <div className="profit-value">{formatCurrency(Number(summary.total_revenue))}</div>
      </div>
      <div className="profit-card success">
        <div className="profit-label">Gross Profit</div>
        <div className="profit-value">{formatCurrency(Number(summary.gross_profit))}</div>
        {profitMargin ? (
          <div className="profit-hint">
            {profitMargin}% margin on costed items
          </div>
        ) : null}
      </div>
      <div className="profit-card">
        <div className="profit-label">Total Cost</div>
        <div className="profit-value">{formatCurrency(Number(summary.total_cost))}</div>
      </div>
      <div className="profit-card warning">
        <div className="profit-label">Costed Revenue</div>
        <div className="profit-value">{formatCurrency(Number(summary.costed_revenue))}</div>
        <div className="profit-hint">Revenue from products with a cost price set</div>
      </div>
      {summary.uncosted_revenue > 0 ? (
        <div className="profit-card profit-card--notice">
          <div className="profit-label">Uncosted Revenue</div>
          <div className="profit-value">{formatCurrency(Number(summary.uncosted_revenue))}</div>
          <div className="profit-hint">
            Revenue from products without a cost price — profit not computed for these.
          </div>
        </div>
      ) : null}
    </div>
  );
}

function WarehouseTab({ rows }: { rows: MovementRow[] }) {
  if (rows.length === 0) {
    return <div className="empty-state">No warehouse movements found for this period.</div>;
  }

  return (
    <div className="table-wrap">
      <table className="responsive-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Product</th>
            <th>Type</th>
            <th className="num">Delta</th>
            <th>Invoice</th>
            <th>Actor</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.movement_id}>
              <td data-label="Date">{formatTs(r.created_at)}</td>
              <td data-label="Product">
                <span>{r.product_name}</span>
                <span className="muted"> · <code>{r.sku}</code></span>
              </td>
              <td data-label="Type">
                <span className={`chip ${MOVEMENT_TONES[r.movement_type]}`}>
                  {MOVEMENT_LABELS[r.movement_type]}
                </span>
              </td>
              <td data-label="Delta" className="num">
                <span className={r.quantity_delta > 0 ? "delta-positive" : "delta-negative"}>
                  {r.quantity_delta > 0 ? "+" : ""}{r.quantity_delta}
                </span>
              </td>
              <td data-label="Invoice">{r.invoice_number ?? "—"}</td>
              <td data-label="Actor">{r.actor}</td>
              <td data-label="Note">{r.note ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Main component ----------

export function ReportsClient({ initialData }: { initialData: InitialData }) {
  const [activeTab, setActiveTab] = useState<Tab>("sales");
  const [from, setFrom] = useState(initialData.defaultFrom);
  const [to, setTo] = useState(initialData.defaultTo);
  const [salesRows, setSalesRows] = useState(initialData.salesRows);
  const [bestSellers, setBestSellers] = useState(initialData.bestSellers);
  const [profit, setProfit] = useState<ProfitSummary | null>(initialData.profit);
  const [movements, setMovements] = useState(initialData.movements);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApply() {
    if (!from || !to) return;
    setLoading(true);
    setError(null);
    try {
      const fromTs = new Date(from + "T00:00:00Z").toISOString();
      const toNext = new Date(to + "T00:00:00Z");
      toNext.setUTCDate(toNext.getUTCDate() + 1);
      const toTs = toNext.toISOString();

      const [s, b, p, m] = await Promise.all([
        fetch(`/api/reports/sales?from=${encodeURIComponent(fromTs)}&to=${encodeURIComponent(toTs)}`),
        fetch(`/api/reports/best-sellers?from=${encodeURIComponent(fromTs)}&to=${encodeURIComponent(toTs)}`),
        fetch(`/api/reports/profit?from=${encodeURIComponent(fromTs)}&to=${encodeURIComponent(toTs)}`),
        fetch(`/api/reports/stock-movements?from=${encodeURIComponent(fromTs)}&to=${encodeURIComponent(toTs)}`)
      ]);

      if (!s.ok || !b.ok || !p.ok || !m.ok) {
        throw new Error("One or more report requests failed.");
      }

      const [sd, bd, pd, md] = await Promise.all([s.json(), b.json(), p.json(), m.json()]);
      setSalesRows(sd.rows ?? []);
      setBestSellers(bd.rows ?? []);
      setProfit(pd.summary ?? null);
      setMovements(md.rows ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <section className="page-head reveal">
        <div>
          <h1>Reports</h1>
          <p className="page-subtitle">Sales, best sellers, profit, and warehouse movements.</p>
        </div>
      </section>

      <div className="card report-filter reveal">
        <div className="report-filter-row">
          <label className="field">
            <span>From</span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="field">
            <span>To</span>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <button className="btn primary" onClick={handleApply} disabled={loading}>
            {loading ? "Loading…" : "Apply"}
          </button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
      </div>

      <div className="report-tabs reveal">
        {(["sales", "best-sellers", "profit", "warehouse"] as Tab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`report-tab-btn${activeTab === tab ? " active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <section className="card stack report-section reveal">
        {activeTab === "sales" && <SalesTab rows={salesRows} />}
        {activeTab === "best-sellers" && <BestSellersTab rows={bestSellers} />}
        {activeTab === "profit" && <ProfitTab summary={profit} />}
        {activeTab === "warehouse" && <WarehouseTab rows={movements} />}
      </section>
    </div>
  );
}
