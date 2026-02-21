import Link from "next/link";
import { getDashboardMetrics, getLowStockItems } from "@/lib/queries";
import { formatCurrency } from "@/lib/format";
import { KpiCard } from "@/components/KpiCard";

export default async function DashboardPage() {
  const [metrics, lowStock] = await Promise.all([
    getDashboardMetrics(),
    getLowStockItems()
  ]);

  return (
    <div className="page">
      <section className="page-head reveal">
        <div>
          <h1>Dashboard</h1>
          <p className="page-subtitle">
            Monitor invoices, revenue, and stock health in one place.
          </p>
        </div>
        <Link className="btn primary" href="/dashboard/invoices/new">
          New Invoice
        </Link>
      </section>

      <section className="metric-grid stagger">
        <KpiCard
          label="Invoices Today"
          value={String(metrics.invoices_today)}
          hint="Confirmed invoices created today"
          href="/dashboard/invoices"
        />
        <KpiCard
          label="Invoices This Month"
          value={String(metrics.invoices_month)}
          hint="Confirmed invoices in current month"
          tone="success"
          href="/dashboard/invoices"
        />
        <KpiCard
          label="Revenue Today"
          value={formatCurrency(metrics.revenue_today)}
          hint="Confirmed totals collected today"
          tone="warning"
          href="/dashboard/reports"
        />
        <KpiCard
          label="Revenue This Month"
          value={formatCurrency(metrics.revenue_month)}
          hint="Confirmed totals collected this month"
          tone="accent"
          href="/dashboard/reports"
        />
      </section>

      <section className="card stack reveal">
        <div className="page-head">
          <div>
            <h2>Low Stock Preview</h2>
            <p className="page-subtitle">
              <span className="chip warning">{lowStock.length} items</span>
            </p>
          </div>
          <Link className="btn" href="/dashboard/low-stock">
            View all
          </Link>
        </div>
        <div className="table-wrap">
          <table className="responsive-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Stock</th>
                <th>Threshold</th>
              </tr>
            </thead>
            <tbody>
              {lowStock.slice(0, 5).map((item) => (
                <tr key={item.id}>
                  <td data-label="SKU">{item.sku}</td>
                  <td data-label="Name">{item.name}</td>
                  <td data-label="Stock">{item.current_stock}</td>
                  <td data-label="Threshold">{item.threshold}</td>
                </tr>
              ))}
              {lowStock.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    <div className="empty-state">No low stock items.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
