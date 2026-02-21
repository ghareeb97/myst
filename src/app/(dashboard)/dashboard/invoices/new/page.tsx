import { requireAuth } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { canAddDiscount } from "@/lib/authz";
import { InvoiceForm } from "@/components/InvoiceForm";

export default async function NewInvoicePage() {
  const profile = await requireAuth();
  const supabase = await createSupabaseServerClient();

  const { data: products } = await supabase
    .from("products")
    .select("id, name, sku, sale_price, current_stock, is_digital")
    .eq("status", "active")
    .order("name", { ascending: true });

  return (
    <div className="stack">
      <h1 style={{ marginBottom: 0 }}>New Invoice</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Unit prices are locked to product price.
      </p>
      <InvoiceForm products={products ?? []} canDiscount={canAddDiscount(profile.role)} />
    </div>
  );
}
