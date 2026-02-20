import { requireRole } from "@/lib/auth";
import { ProductForm } from "@/components/ProductForm";

export default async function NewProductPage() {
  await requireRole("manager");

  return (
    <div className="stack">
      <h1 style={{ marginBottom: 0 }}>New Product</h1>
      <ProductForm mode="create" />
    </div>
  );
}
