import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { InvoiceFilters } from "@/components/InvoiceFilters";
import type { InvoiceFilterValues } from "@/components/InvoiceFilters";

// Cairo is UTC+2 year-round (no DST since 2011)
const CAIRO_OFFSET = "+02:00";

function pickSingleRelation<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T | undefined) ?? null;
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

type InvoicesPageProps = {
  searchParams: Promise<{
    q?: string;
    paymentStatus?: string;
    invoiceStatus?: string;
    from?: string;
    to?: string;
    preset?: string;
  }>;
};

export default async function InvoicesPage({ searchParams }: InvoicesPageProps) {
  const sp = await searchParams;
  const q              = sp.q?.trim() ?? "";
  const paymentStatus  = sp.paymentStatus ?? "";
  const invoiceStatus  = sp.invoiceStatus ?? "";
  const from           = sp.from ?? "";
  const to             = sp.to ?? "";
  const preset         = sp.preset ?? "";

  const supabase = await createSupabaseServerClient();

  // ── Receivables (always unfiltered) ──────────────────────
  const { data: receivables } = await supabase
    .from("invoices")
    .select("id, invoice_number, customer_name, remaining_amount, payment_status")
    .eq("status", "confirmed")
    .in("payment_status", ["unpaid", "partially_paid"])
    .order("created_at", { ascending: false });

  // ── Main invoice query ────────────────────────────────────
  let query = supabase
    .from("invoices")
    .select(
      "id, invoice_number, created_at, customer_name, reference_number, total, paid_amount, remaining_amount, payment_status, status, profiles:created_by(full_name)"
    )
    .order("created_at", { ascending: false })
    .limit(300);

  if (q) {
    query = query.or(
      `invoice_number.ilike.%${q}%,customer_name.ilike.%${q}%,reference_number.ilike.%${q}%`
    );
  }
  if (paymentStatus) {
    query = query.eq("payment_status", paymentStatus);
  }
  if (invoiceStatus) {
    query = query.eq("status", invoiceStatus);
  }
  if (from) {
    query = query.gte("created_at", `${from}T00:00:00${CAIRO_OFFSET}`);
  }
  if (to) {
    query = query.lte("created_at", `${to}T23:59:59${CAIRO_OFFSET}`);
  }

  const { data: invoices } = await query;

  const currentFilters: InvoiceFilterValues = {
    q,
    paymentStatus,
    invoiceStatus,
    from,
    to,
    preset,
  };

  const isFiltered = q || paymentStatus || invoiceStatus || from || to;

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
                  <td colSpan={4}>
                    <div className="empty-state">No unpaid or partially paid invoices.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <InvoiceFilters current={currentFilters} />

      <section className="card stack reveal">
        <div className="page-head" style={{ alignItems: "center" }}>
          <h2>
            {isFiltered ? "Filtered Invoices" : "All Invoices"}
          </h2>
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            {invoices?.length ?? 0} result{invoices?.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="table-wrap">
          <table className="responsive-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Ref #</th>
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
                    <td data-label="Ref #">{invoice.reference_number ?? "-"}</td>
                    <td data-label="Created By">{createdBy?.full_name ?? "-"}</td>
                    <td data-label="Total">{formatCurrency(invoice.total)}</td>
                    <td data-label="Paid">{formatCurrency(invoice.paid_amount)}</td>
                    <td data-label="Remaining">{formatCurrency(invoice.remaining_amount)}</td>
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
                  <td colSpan={10}>
                    <div className="empty-state">No invoices match your filters.</div>
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
