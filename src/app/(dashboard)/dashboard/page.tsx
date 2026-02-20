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
    <div className="stack">
      <section className="grid cols-2">
        <KpiCard label="Invoices Today" value={String(metrics.invoices_today)} />
        <KpiCard label="Invoices This Month" value={String(metrics.invoices_month)} />
        <KpiCard
          label="Revenue Today"
          value={formatCurrency(metrics.revenue_today)}
        />
        <KpiCard
          label="Revenue This Month"
          value={formatCurrency(metrics.revenue_month)}
        />
      </section>

      <section className="card stack">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <h2 style={{ margin: 0 }}>Low Stock Items ({lowStock.length})</h2>
          <Link className="btn" href="/dashboard/low-stock">
            View all
          </Link>
        </div>
        <div className="table-wrap">
          <table>
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
                  <td>{item.sku}</td>
                  <td>{item.name}</td>
                  <td>{item.current_stock}</td>
                  <td>{item.threshold}</td>
                </tr>
              ))}
              {lowStock.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No low stock items.
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
