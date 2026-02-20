import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { canManageProducts } from "@/lib/authz";
import { formatCurrency } from "@/lib/format";

type ProductsPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const profile = await requireAuth();
  const { q } = await searchParams;
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("products")
    .select(
      "id, sku, name, category, sale_price, current_stock, low_stock_threshold, status"
    )
    .order("name", { ascending: true });

  if (q) {
    query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%`);
  }

  const { data: products } = await query;

  return (
    <div className="stack">
      <section className="card stack">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <h1 style={{ margin: 0 }}>Products</h1>
          {canManageProducts(profile.role) ? (
            <Link className="btn primary" href="/dashboard/products/new">
              New Product
            </Link>
          ) : null}
        </div>
        <form method="get">
          <input defaultValue={q} name="q" placeholder="Search by name or SKU" />
        </form>
      </section>

      <section className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Status</th>
              {canManageProducts(profile.role) ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {(products ?? []).map((product) => (
              <tr key={product.id}>
                <td>{product.sku}</td>
                <td>{product.name}</td>
                <td>{formatCurrency(product.sale_price)}</td>
                <td className={product.current_stock < 0 ? "danger" : ""}>
                  {product.current_stock}
                </td>
                <td>{product.status}</td>
                {canManageProducts(profile.role) ? (
                  <td>
                    <Link className="btn" href={`/dashboard/products/${product.id}/edit`}>
                      Edit
                    </Link>
                  </td>
                ) : null}
              </tr>
            ))}
            {products?.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No products found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
