import Link from "next/link";
import type { Route } from "next";
import { requireAuth } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { ORDER_STATUSES, orderStatusChip, orderStatusLabel, summarizeOrderItems } from "@/lib/orders";
import type { OrderStatus } from "@/lib/types";

type OrdersPageProps = {
  searchParams: Promise<{ status?: string }>;
};

const OPEN: OrderStatus[] = ["new", "in_progress", "ready"];

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  await requireAuth();
  const sp = await searchParams;
  const filter = ORDER_STATUSES.includes(sp.status as OrderStatus) ? (sp.status as OrderStatus) : "open";

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("orders")
    .select(
      "id, code, customer_name, customer_phone, delivery_method, status, total, invoice_id, created_at, order_items(kind, quantity)"
    )
    .order("created_at", { ascending: false })
    .limit(300);

  query = filter === "open" ? query.in("status", OPEN) : query.eq("status", filter);

  const { data: orders } = await query;

  const tabs: { key: string; label: string }[] = [
    { key: "open", label: "Open" },
    ...ORDER_STATUSES.map((s) => ({ key: s, label: orderStatusLabel(s) })),
  ];

  return (
    <div className="page">
      <section className="page-head reveal">
        <div>
          <h1>Online Orders</h1>
          <p className="page-subtitle">Print and gift orders placed on the website. Newest first.</p>
        </div>
      </section>

      <nav className="filter-chips reveal" aria-label="Filter by status">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={(t.key === "open" ? "/dashboard/orders" : `/dashboard/orders?status=${t.key}`) as Route}
            className={`chip${filter === t.key ? " accent is-current" : ""}`}
            aria-current={filter === t.key ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <section className="card stack reveal">
        <div className="table-wrap">
          <table className="responsive-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Placed</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Items</th>
                <th>Total</th>
                <th>Method</th>
                <th>Status</th>
                <th>Invoice</th>
              </tr>
            </thead>
            <tbody>
              {(orders ?? []).map((o) => {
                return (
                  <tr key={o.id}>
                    <td data-label="Order">
                      <Link href={`/dashboard/orders/${o.id}` as Route}>{o.code}</Link>
                    </td>
                    <td data-label="Placed">{formatDateTime(o.created_at)}</td>
                    <td data-label="Customer">{o.customer_name}</td>
                    <td data-label="Phone">
                      <a href={`tel:${o.customer_phone}`}>{o.customer_phone}</a>
                    </td>
                    <td data-label="Items">{summarizeOrderItems(o.order_items ?? [])}</td>
                    <td data-label="Total">{formatCurrency(o.total)}</td>
                    <td data-label="Method">{o.delivery_method === "delivery" ? "Delivery" : "Pickup"}</td>
                    <td data-label="Status">
                      <span className={orderStatusChip(o.status)}>{orderStatusLabel(o.status, o.delivery_method)}</span>
                    </td>
                    <td data-label="Invoice">{o.invoice_id ? <span className="chip success">Invoiced</span> : "-"}</td>
                  </tr>
                );
              })}
              {orders?.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">No orders here.</div>
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
