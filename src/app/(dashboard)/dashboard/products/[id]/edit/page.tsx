import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { ProductForm } from "@/components/ProductForm";

type EditProductPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditProductPage({ params }: EditProductPageProps) {
  await requireRole("manager");
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: product } = await supabase
    .from("products")
    .select(
      "id, sku, name, category, sale_price, cost_price, current_stock, low_stock_threshold, status"
    )
    .eq("id", id)
    .single();

  if (!product) {
    notFound();
  }

  return (
    <div className="stack">
      <h1 style={{ marginBottom: 0 }}>Edit Product</h1>
      <ProductForm mode="edit" initial={product} />
    </div>
  );
}
