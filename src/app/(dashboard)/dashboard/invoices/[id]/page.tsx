import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import {
  canEditInvoicePayments,
  canVoidInvoices,
  canDeleteInvoices,
  canEditInvoiceInfo,
  getInvoiceDateBounds
} from "@/lib/authz";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { formatCurrency, formatDateTime, formatDateOnly } from "@/lib/format";
import { PaymentEditor } from "@/components/PaymentEditor";
import { VoidInvoiceButton } from "@/components/VoidInvoiceButton";
import { DeleteInvoiceButton } from "@/components/DeleteInvoiceButton";
import { EditInvoiceForm } from "@/components/EditInvoiceForm";

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

type InvoiceDetailsPageProps = {
  params: Promise<{ id: string }>;
};

export default async function InvoiceDetailsPage({
  params
}: InvoiceDetailsPageProps) {
  const profile = await requireAuth();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: invoice }, { data: items }, { data: auditLog }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, invoice_number, invoice_date, created_at, customer_name, customer_phone, reference_number, subtotal, discount, total, paid_amount, remaining_amount, payment_status, status, created_by, voided_at, void_reason, addon_qss, addon_ps, profiles:created_by(full_name)"
      )
      .eq("id", id)
      .single(),
    supabase
      .from("invoice_items")
      .select("id, quantity, unit_price, line_total, products:product_id(name, sku)")
      .eq("invoice_id", id),
    supabase
      .from("invoice_audit_log")
      .select("id, action, created_at, details, profiles:actor_id(full_name)")
      .eq("invoice_id", id)
      .order("created_at", { ascending: false })
  ]);

  if (!invoice) {
    notFound();
  }

  // Enforce date bounds: sales/supervisor cannot view invoices outside their window
  const dateBounds = getInvoiceDateBounds(profile.role);
  if (dateBounds !== null) {
    const CAIRO_OFFSET = "+02:00";
    const invoiceTs = invoice.created_at;
    const fromTs = `${dateBounds.from}T00:00:00${CAIRO_OFFSET}`;
    const toTs   = `${dateBounds.to}T23:59:59${CAIRO_OFFSET}`;
    if (invoiceTs < fromTs || invoiceTs > toTs) {
      redirect("/dashboard/invoices");
    }
  }

  const createdBy = pickSingleRelation<{ full_name?: string }>(invoice.profiles);

  return (
    <div className="page">
      <section className="card stack reveal">
        <div className="page-head">
          <div>
            <h1>Invoice {invoice.invoice_number}</h1>
            <p className="page-subtitle">
              {invoice.invoice_date
                ? formatDateOnly(invoice.invoice_date)
                : formatDateTime(invoice.created_at)}
              {" · "}created {formatDateTime(invoice.created_at)}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
            {canEditInvoiceInfo(profile.role) && invoice.status === "confirmed" ? (
              <EditInvoiceForm
                invoiceId={invoice.id}
                initialCustomerName={invoice.customer_name}
                initialCustomerPhone={invoice.customer_phone}
                initialReferenceNumber={invoice.reference_number}
                initialInvoiceDate={invoice.invoice_date}
              />
            ) : null}
            <div className="status-stack">
              <span className={paymentStatusClass(invoice.payment_status)}>
                {invoice.payment_status}
              </span>
              <span className={invoiceStatusClass(invoice.status)}>
                {invoice.status}
              </span>
            </div>
          </div>
        </div>

        <div className="summary-grid">
          <div className="summary-item">
            <div className="label">Created By</div>
            <div className="value">{createdBy?.full_name ?? "-"}</div>
          </div>
          <div className="summary-item">
            <div className="label">Customer</div>
            <div className="value">{invoice.customer_name ?? "-"}</div>
          </div>
          <div className="summary-item">
            <div className="label">Customer Phone</div>
            <div className="value">{invoice.customer_phone ?? "-"}</div>
          </div>
          <div className="summary-item">
            <div className="label">Invoice Date</div>
            <div className="value">
              {invoice.invoice_date
                ? formatDateOnly(invoice.invoice_date)
                : formatDateTime(invoice.created_at)}
            </div>
          </div>
          {invoice.reference_number ? (
            <div className="summary-item">
              <div className="label">Reference Number</div>
              <div className="value">{invoice.reference_number}</div>
            </div>
          ) : null}
        </div>

        {invoice.status === "void" ? (
          <p className="warning-banner">
            Voided at {invoice.voided_at ? formatDateTime(invoice.voided_at) : "-"}{" "}
            {invoice.void_reason ? `(${invoice.void_reason})` : ""}
          </p>
        ) : null}
      </section>

      <section className="card stack reveal">
        <h2>Line Items</h2>
        <div className="table-wrap">
          <table className="responsive-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Line Total</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((item) => {
              const product = pickSingleRelation<{ name?: string; sku?: string }>(
                item.products
              );
              return (
                <tr key={item.id}>
                  <td data-label="Product">{product?.name ?? "-"}</td>
                  <td data-label="SKU">{product?.sku ?? "-"}</td>
                  <td data-label="Qty">{item.quantity}</td>
                  <td data-label="Unit Price">{formatCurrency(item.unit_price)}</td>
                  <td data-label="Line Total">{formatCurrency(item.line_total)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="totals-row">
              <td colSpan={4} style={{ textAlign: "right", fontWeight: 600, color: "var(--text-muted)", fontSize: "0.88rem" }}>Total</td>
              <td style={{ fontWeight: 700, color: "var(--text-strong)" }}>{formatCurrency(invoice.total)}</td>
            </tr>
          </tfoot>
          </table>
        </div>
      </section>

      <section className="card stack reveal">
        <h2>Financial Summary</h2>
        <div className="summary-grid">
          <div className="summary-item">
            <div className="label">Subtotal</div>
            <div className="value">{formatCurrency(invoice.subtotal)}</div>
          </div>
          {invoice.addon_qss ? (
            <div className="summary-item">
              <div className="label">QSS</div>
              <div className="value">{formatCurrency(invoice.addon_qss)}</div>
            </div>
          ) : null}
          {invoice.addon_ps ? (
            <div className="summary-item">
              <div className="label">PS (Photoshop)</div>
              <div className="value">{formatCurrency(invoice.addon_ps)}</div>
            </div>
          ) : null}
          <div className="summary-item">
            <div className="label">Discount</div>
            <div className="value">{formatCurrency(invoice.discount)}</div>
          </div>
          <div className="summary-item">
            <div className="label">Total</div>
            <div className="value">{formatCurrency(invoice.total)}</div>
          </div>
          <div className="summary-item">
            <div className="label">Paid</div>
            <div className="value">{formatCurrency(invoice.paid_amount)}</div>
          </div>
          <div className="summary-item">
            <div className="label">Remaining</div>
            <div className="value">{formatCurrency(invoice.remaining_amount)}</div>
          </div>
        </div>
      </section>

      {canEditInvoicePayments(profile.role) && invoice.status === "confirmed" ? (
        <PaymentEditor
          invoiceId={invoice.id}
          total={invoice.total}
          paidAmount={invoice.paid_amount}
        />
      ) : null}

      {canVoidInvoices(profile.role) && invoice.status === "confirmed" ? (
        <VoidInvoiceButton invoiceId={invoice.id} invoiceNumber={invoice.invoice_number} />
      ) : null}

      {canDeleteInvoices(profile.role) ? (
        <DeleteInvoiceButton invoiceId={invoice.id} invoiceNumber={invoice.invoice_number} />
      ) : null}

      {(auditLog?.length ?? 0) > 0 ? (
        <section className="card stack reveal">
          <h2>Activity Log</h2>
          <div className="table-wrap">
            <table className="responsive-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>By</th>
                  <th>When</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {(auditLog ?? []).map((entry) => {
                  const actor = pickSingleRelation<{ full_name?: string }>(entry.profiles);
                  const details = entry.details as Record<string, string> | null;
                  const detailParts: string[] = [];
                  if (details?.customer_name) detailParts.push(`Name: ${details.customer_name}`);
                  if (details?.customer_phone) detailParts.push(`Phone: ${details.customer_phone}`);
                  if (details?.reference_number) detailParts.push(`Ref: ${details.reference_number}`);
                  if (details?.invoice_date) detailParts.push(`Date: ${details.invoice_date}`);
                  return (
                    <tr key={entry.id}>
                      <td data-label="Action">
                        <span className="chip accent">
                          {entry.action === "edit_info" ? "Info edited" : entry.action}
                        </span>
                      </td>
                      <td data-label="By">{actor?.full_name ?? "-"}</td>
                      <td data-label="When">{formatDateTime(entry.created_at)}</td>
                      <td data-label="Details" className="muted" style={{ fontSize: "0.85rem" }}>
                        {detailParts.length > 0 ? detailParts.join(" · ") : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
