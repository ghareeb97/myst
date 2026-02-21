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
  const canManage = canManageProducts(profile.role);
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
    <div className="page">
      <section className="page-head reveal">
        <div>
          <h1>Products</h1>
          <p className="page-subtitle">
            Manage pricing, stock levels, and active product availability.
          </p>
        </div>
        {canManage ? (
          <Link className="btn primary" href="/dashboard/products/new">
            New Product
          </Link>
        ) : null}
      </section>

      <section className="card stack reveal">
        <form className="search-form" method="get">
          <label htmlFor="product-search">Search products</label>
          <div className="search-row">
            <input
              id="product-search"
              defaultValue={q}
              name="q"
              placeholder="Search by name or SKU"
            />
            <button className="btn" type="submit">
              Search
            </button>
            {q ? (
              <Link className="btn ghost" href="/dashboard/products">
                Clear
              </Link>
            ) : null}
          </div>
        </form>
      </section>

      <section className="card table-wrap reveal">
        <table className="responsive-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Price</th>
              <th>Stock</th>
              <th>Status</th>
              {canManage ? <th>Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {(products ?? []).map((product) => (
              <tr key={product.id}>
                <td data-label="SKU">{product.sku}</td>
                <td data-label="Name">{product.name}</td>
                <td data-label="Price">{formatCurrency(product.sale_price)}</td>
                <td data-label="Stock" className={product.current_stock < 0 ? "danger" : ""}>
                  {product.current_stock}
                </td>
                <td data-label="Status">
                  <span
                    className={product.status === "active" ? "chip success" : "chip warning"}
                  >
                    {product.status}
                  </span>
                </td>
                {canManage ? (
                  <td data-label="Actions">
                    <Link
                      className="btn sm"
                      href={`/dashboard/products/${product.id}/edit`}
                    >
                      Edit
                    </Link>
                  </td>
                ) : null}
              </tr>
            ))}
            {products?.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 6 : 5} className="muted">
                  <div className="empty-state">No products found.</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
