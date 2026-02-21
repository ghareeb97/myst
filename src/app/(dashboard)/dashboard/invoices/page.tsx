import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { formatCurrency, formatDateTime } from "@/lib/format";

function pickSingleRelation<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] as T | undefined) ?? null;
  }
  return (value as T | null) ?? null;
}

export default async function InvoicesPage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: invoices }, { data: receivables }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, invoice_number, created_at, customer_name, total, paid_amount, remaining_amount, payment_status, status, profiles:created_by(full_name)"
      )
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("invoices")
      .select("id, invoice_number, customer_name, remaining_amount, payment_status")
      .eq("status", "confirmed")
      .in("payment_status", ["unpaid", "partially_paid"])
      .order("created_at", { ascending: false })
  ]);

  return (
    <div className="stack">
      <section className="card" style={{ display: "flex", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Invoices</h1>
        <Link className="btn primary" href="/dashboard/invoices/new">
          New Invoice
        </Link>
      </section>

      <section className="card stack">
        <h2 style={{ margin: 0 }}>Receivables</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Remaining</th>
              </tr>
            </thead>
            <tbody>
              {(receivables ?? []).map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/dashboard/invoices/${row.id}`}>{row.invoice_number}</Link>
                  </td>
                  <td>{row.customer_name ?? "-"}</td>
                  <td>{row.payment_status}</td>
                  <td>{formatCurrency(row.remaining_amount)}</td>
                </tr>
              ))}
              {receivables?.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No unpaid or partially paid invoices.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>No.</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Created By</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Remaining</th>
              <th>Payment</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(invoices ?? []).map((invoice) => {
              const createdBy = pickSingleRelation<{ full_name?: string }>(
                invoice.profiles
              );

              return (
                <tr key={invoice.id}>
                  <td>
                    <Link href={`/dashboard/invoices/${invoice.id}`}>
                      {invoice.invoice_number}
                    </Link>
                  </td>
                  <td>{formatDateTime(invoice.created_at)}</td>
                  <td>{invoice.customer_name ?? "-"}</td>
                  <td>{createdBy?.full_name ?? "-"}</td>
                  <td>{formatCurrency(invoice.total)}</td>
                  <td>{formatCurrency(invoice.paid_amount)}</td>
                  <td>{formatCurrency(invoice.remaining_amount)}</td>
                  <td>{invoice.payment_status}</td>
                  <td>{invoice.status}</td>
                </tr>
              );
            })}
            {invoices?.length === 0 ? (
              <tr>
                <td colSpan={9} className="muted">
                  No invoices yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
