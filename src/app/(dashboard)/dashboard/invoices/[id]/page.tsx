import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { canEditInvoicePayments, canVoidInvoices } from "@/lib/authz";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { PaymentEditor } from "@/components/PaymentEditor";
import { VoidInvoiceButton } from "@/components/VoidInvoiceButton";

function pickSingleRelation<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] as T | undefined) ?? null;
  }
  return (value as T | null) ?? null;
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

  const [{ data: invoice }, { data: items }] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, invoice_number, created_at, customer_name, customer_phone, subtotal, discount, total, paid_amount, remaining_amount, payment_status, status, created_by, voided_at, void_reason, profiles:created_by(full_name)"
      )
      .eq("id", id)
      .single(),
    supabase
      .from("invoice_items")
      .select("id, quantity, unit_price, line_total, products:product_id(name, sku)")
      .eq("invoice_id", id)
  ]);

  if (!invoice) {
    notFound();
  }

  const createdBy = pickSingleRelation<{ full_name?: string }>(invoice.profiles);

  return (
    <div className="stack">
      <section className="card stack">
        <h1 style={{ margin: 0 }}>Invoice {invoice.invoice_number}</h1>
        <div className="grid cols-2">
          <p className="muted" style={{ margin: 0 }}>
            Date: {formatDateTime(invoice.created_at)}
          </p>
          <p className="muted" style={{ margin: 0 }}>
            Created by:{" "}
            {createdBy?.full_name ?? "-"}
          </p>
        </div>
        <div className="grid cols-2">
          <p style={{ margin: 0 }}>Customer: {invoice.customer_name ?? "-"}</p>
          <p style={{ margin: 0 }}>Phone: {invoice.customer_phone ?? "-"}</p>
        </div>
        <div className="grid cols-2">
          <p style={{ margin: 0 }}>Payment status: {invoice.payment_status}</p>
          <p style={{ margin: 0 }}>Invoice status: {invoice.status}</p>
        </div>
        {invoice.status === "void" ? (
          <p className="danger" style={{ margin: 0 }}>
            Voided at {invoice.voided_at ? formatDateTime(invoice.voided_at) : "-"}{" "}
            {invoice.void_reason ? `(${invoice.void_reason})` : ""}
          </p>
        ) : null}
      </section>

      <section className="card table-wrap">
        <table>
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
                  <td>{product?.name ?? "-"}</td>
                  <td>{product?.sku ?? "-"}</td>
                  <td>{item.quantity}</td>
                  <td>{formatCurrency(item.unit_price)}</td>
                  <td>{formatCurrency(item.line_total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card stack">
        <div className="grid cols-2">
          <p style={{ margin: 0 }}>Subtotal: {formatCurrency(invoice.subtotal)}</p>
          <p style={{ margin: 0 }}>Discount: {formatCurrency(invoice.discount)}</p>
          <p style={{ margin: 0 }}>Total: {formatCurrency(invoice.total)}</p>
          <p style={{ margin: 0 }}>Paid: {formatCurrency(invoice.paid_amount)}</p>
          <p style={{ margin: 0 }}>
            Remaining: {formatCurrency(invoice.remaining_amount)}
          </p>
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
        <VoidInvoiceButton invoiceId={invoice.id} />
      ) : null}
    </div>
  );
}
