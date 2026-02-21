import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { formatCurrency, formatDateTime } from "@/lib/format";

function pickSingleRelation<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] as T | undefined) ?? null;
  }
  return (value as T | null) ?? null;
}

function paymentStatusClass(status: string) {
  if (status === "paid") return "chip success";
  if (status === "partially_paid") return "chip warning";
  return "chip danger";
}

function invoiceStatusClass(status: string) {
  return status === "confirmed" ? "chip accent" : "chip warning";
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
    <div className="page">
      <section className="page-head reveal">
        <div>
          <h1>Invoices</h1>
          <p className="page-subtitle">
            Track receivables and payment status across recent sales.
          </p>
        </div>
        <Link className="btn primary" href="/dashboard/invoices/new">
          New Invoice
        </Link>
      </section>

      <section className="card stack reveal">
        <div className="page-head">
          <div>
            <h2>Receivables</h2>
            <p className="page-subtitle">
              <span className="chip warning">{receivables?.length ?? 0} open</span>
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="responsive-table">
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
                  <td data-label="Invoice">
                    <Link href={`/dashboard/invoices/${row.id}`}>{row.invoice_number}</Link>
                  </td>
                  <td data-label="Customer">{row.customer_name ?? "-"}</td>
                  <td data-label="Status">
                    <span className={paymentStatusClass(row.payment_status)}>
                      {row.payment_status}
                    </span>
                  </td>
                  <td data-label="Remaining">
                    {formatCurrency(row.remaining_amount)}
                  </td>
                </tr>
              ))}
              {receivables?.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    <div className="empty-state">
                      No unpaid or partially paid invoices.
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card stack reveal">
        <h2>Recent Invoices</h2>
        <div className="table-wrap">
          <table className="responsive-table">
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
                  <td data-label="No.">
                    <Link href={`/dashboard/invoices/${invoice.id}`}>
                      {invoice.invoice_number}
                    </Link>
                  </td>
                  <td data-label="Date">{formatDateTime(invoice.created_at)}</td>
                  <td data-label="Customer">{invoice.customer_name ?? "-"}</td>
                  <td data-label="Created By">{createdBy?.full_name ?? "-"}</td>
                  <td data-label="Total">{formatCurrency(invoice.total)}</td>
                  <td data-label="Paid">{formatCurrency(invoice.paid_amount)}</td>
                  <td data-label="Remaining">
                    {formatCurrency(invoice.remaining_amount)}
                  </td>
                  <td data-label="Payment">
                    <span className={paymentStatusClass(invoice.payment_status)}>
                      {invoice.payment_status}
                    </span>
                  </td>
                  <td data-label="Status">
                    <span className={invoiceStatusClass(invoice.status)}>
                      {invoice.status}
                    </span>
                  </td>
                </tr>
              );
            })}
            {invoices?.length === 0 ? (
              <tr>
                <td colSpan={9} className="muted">
                  <div className="empty-state">No invoices yet.</div>
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
