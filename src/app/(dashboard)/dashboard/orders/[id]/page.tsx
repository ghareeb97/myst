import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { canConfirmOrders, canHandleOrders } from "@/lib/authz";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { nextStatuses, orderStatusChip, orderStatusLabel } from "@/lib/orders";
import { CustomerMessages, type OutboxRow } from "@/components/CustomerMessages";
import { OrderActions } from "@/components/OrderActions";
import type { Order, OrderItem } from "@/lib/types";

function pickSingleRelation<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
  return (value as T | null) ?? null;
}

type OrderPageProps = {
  params: Promise<{ id: string }>;
};

export default async function OrderDetailsPage({ params }: OrderPageProps) {
  const profile = await requireAuth();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: order }, { data: items }, { data: events }, { data: messages }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, code, customer_name, customer_phone, delivery_method, area, address, notes, payment_method, status, total, invoice_id, created_at, updated_at, invoices:invoice_id(invoice_number)"
      )
      .eq("id", id)
      .single(),
    supabase
      .from("order_items")
      .select("id, size_cm, quantity, unit_price, line_total, file_path, file_name")
      .eq("order_id", id)
      .order("created_at"),
    supabase
      .from("order_events")
      .select("id, action, details, created_at, profiles:actor_id(full_name)")
      .eq("order_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("whatsapp_outbox")
      .select("id, event, to_phone, body, status, error, created_at, sent_at")
      .eq("order_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!order) notFound();
  const o = order as Order & { invoices: unknown };
  const lines = (items ?? []) as OrderItem[];
  const invoice = pickSingleRelation<{ invoice_number?: string }>(o.invoices);

  // Signed links are created with the service role so staff never need storage grants of their own.
  const admin = createSupabaseAdminClient();
  const { data: signed } = lines.length
    ? await admin.storage.from("order-uploads").createSignedUrls(
        lines.map((l) => l.file_path),
        600
      )
    : { data: [] };
  const urlByPath = new Map((signed ?? []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));

  const prints = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="page">
      <section className="page-head reveal">
        <div>
          <h1>{o.code}</h1>
          <p className="page-subtitle">
            Placed {formatDateTime(o.created_at)} ·{" "}
            <span className={orderStatusChip(o.status)}>{orderStatusLabel(o.status, o.delivery_method)}</span>
          </p>
        </div>
        <Link className="btn ghost" href={"/dashboard/orders" as Route}>
          All orders
        </Link>
      </section>

      <section className="card reveal">
        <div className="summary-grid">
          <div className="summary-item">
            <span className="label">Customer</span>
            <span className="value">{o.customer_name}</span>
          </div>
          <div className="summary-item">
            <span className="label">Phone</span>
            <span className="value">
              <a href={`tel:${o.customer_phone}`}>{o.customer_phone}</a> ·{" "}
              <a href={`https://wa.me/2${o.customer_phone}`} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
            </span>
          </div>
          <div className="summary-item">
            <span className="label">Delivery</span>
            <span className="value">
              {o.delivery_method === "delivery" ? `Delivery${o.area ? ` · ${o.area}` : ""}` : "Pickup at the studio"}
            </span>
          </div>
          <div className="summary-item">
            <span className="label">Payment</span>
            <span className="value">{o.payment_method === "cash_on_delivery" ? "Cash on delivery" : "Pay at pickup"}</span>
          </div>
          <div className="summary-item">
            <span className="label">Total</span>
            <span className="value">{formatCurrency(o.total)}</span>
          </div>
          <div className="summary-item">
            <span className="label">Invoice</span>
            <span className="value">
              {o.invoice_id ? (
                <Link href={`/dashboard/invoices/${o.invoice_id}` as Route}>{invoice?.invoice_number ?? "Open invoice"}</Link>
              ) : (
                "Not invoiced yet"
              )}
            </span>
          </div>
        </div>
        {o.address ? (
          <p className="help-text" style={{ marginTop: 12 }}>
            <strong>Address:</strong> {o.address}
          </p>
        ) : null}
        {o.notes ? (
          <p className="help-text" style={{ marginTop: 8 }}>
            <strong>Notes:</strong> {o.notes}
          </p>
        ) : null}
      </section>

      {canHandleOrders(profile.role) ? (
        <OrderActions
          orderId={o.id}
          orderCode={o.code}
          total={o.total}
          deliveryMethod={o.delivery_method}
          nextStatuses={nextStatuses(o.status)}
          canConfirm={canConfirmOrders(profile.role) && !o.invoice_id && o.status !== "cancelled"}
        />
      ) : null}

      <CustomerMessages rows={(messages ?? []) as OutboxRow[]} deliveryMethod={o.delivery_method} />

      <section className="card stack reveal">
        <div className="page-head" style={{ alignItems: "center" }}>
          <h2>Photos</h2>
          <div className="order-actions">
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              {lines.length} photos · {prints} prints
            </span>
            {lines.length ? (
              <a className="btn sm" href={`/api/orders/${o.id}/zip`}>
                Download all (zip)
              </a>
            ) : null}
          </div>
        </div>
        <div className="table-wrap">
          <table className="responsive-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Photo</th>
                <th>Size (cm)</th>
                <th>Copies</th>
                <th>Unit</th>
                <th>Line total</th>
                <th>File</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => {
                const url = urlByPath.get(l.file_path);
                return (
                  <tr key={l.id}>
                    <td data-label="#">{idx + 1}</td>
                    <td data-label="Photo">
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not worth next/image config
                        <img className="order-thumb" src={url} alt={l.file_name ?? "Photo"} loading="lazy" />
                      ) : (
                        <span className="muted">Missing file</span>
                      )}
                    </td>
                    <td data-label="Size (cm)">{l.size_cm.replace("x", " × ")}</td>
                    <td data-label="Copies">{l.quantity}</td>
                    <td data-label="Unit">{formatCurrency(l.unit_price)}</td>
                    <td data-label="Line total">{formatCurrency(l.line_total)}</td>
                    <td data-label="File">
                      {url ? (
                        <a href={url} download={l.file_name ?? undefined} target="_blank" rel="noopener noreferrer">
                          {l.file_name ?? "Download"}
                        </a>
                      ) : (
                        l.file_name ?? "-"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card stack reveal">
        <h2>History</h2>
        <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {(events ?? []).map((e) => {
            const actor = pickSingleRelation<{ full_name?: string }>(e.profiles);
            const d = (e.details ?? {}) as Record<string, unknown>;
            const text =
              e.action === "created"
                ? `Order placed on the website (${d.items} photos, ${formatCurrency(Number(d.total ?? 0))})`
                : e.action === "status"
                  ? `Status: ${String(d.from)} → ${String(d.to)}`
                  : e.action === "invoiced"
                    ? `Invoiced for ${formatCurrency(Number(d.invoice_total ?? 0))}${
                        Number(d.invoice_total) !== Number(d.order_total)
                          ? ` (order total was ${formatCurrency(Number(d.order_total ?? 0))}; prices changed since ordering)`
                          : ""
                      }`
                    : e.action;
            return (
              <li key={e.id} className="help-text">
                <strong>{formatDateTime(e.created_at)}</strong> · {text}
                {actor?.full_name ? ` · ${actor.full_name}` : ""}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
