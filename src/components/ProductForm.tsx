"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/types";
import { useToast } from "@/components/Toast";

type ProductFormProps = {
  mode: "create" | "edit";
  initial?: Product;
};

export function ProductForm({ mode, initial }: ProductFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/products/categories")
      .then((r) => r.json())
      .then((d: { categories?: string[] }) => {
        if (d.categories) setCategories(d.categories);
      })
      .catch(() => {});
  }, []);

  const defaults = useMemo(
    () => ({
      sku: initial?.sku ?? "",
      name: initial?.name ?? "",
      category: initial?.category ?? "",
      salePrice: initial?.sale_price?.toString() ?? "",
      costPrice: initial?.cost_price?.toString() ?? "",
      currentStock: initial?.current_stock?.toString() ?? "0",
      lowStockThreshold: initial?.low_stock_threshold?.toString() ?? "",
      status: (initial?.status ?? "active") as "active" | "inactive",
      isDigital: initial?.is_digital ?? false,
      allowPriceOverride: initial?.allow_price_override ?? false
    }),
    [initial]
  );

  const [sku, setSku] = useState(defaults.sku);
  const [name, setName] = useState(defaults.name);
  const [category, setCategory] = useState(defaults.category);
  const [salePrice, setSalePrice] = useState(defaults.salePrice);
  const [costPrice, setCostPrice] = useState(defaults.costPrice);
  const [currentStock, setCurrentStock] = useState(defaults.currentStock);
  const [lowStockThreshold, setLowStockThreshold] = useState(
    defaults.lowStockThreshold
  );
  const [status, setStatus] = useState(defaults.status);
  const [isDigital, setIsDigital] = useState(defaults.isDigital);
  const [allowPriceOverride, setAllowPriceOverride] = useState(
    defaults.allowPriceOverride
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload = {
        sku,
        name,
        category: category || null,
        salePrice: Number(salePrice),
        costPrice: costPrice ? Number(costPrice) : null,
        currentStock: isDigital ? 0 : Number(currentStock),
        lowStockThreshold: lowStockThreshold ? Number(lowStockThreshold) : null,
        status,
        isDigital,
        allowPriceOverride
      };

      const endpoint =
        mode === "create" ? "/api/products" : `/api/products/${initial?.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to save product.");
      }

      if (mode === "create") {
        toast.success("Product created.");
        router.replace("/dashboard/products");
      } else {
        toast.success("Product saved.");
        router.refresh();
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unexpected error."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="stack card" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="sku">SKU</label>
        <input
          id="sku"
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          placeholder="Leave empty for auto-generated code"
        />
      </div>
      <div className="field">
        <label htmlFor="name">Name</label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="grid cols-2">
        <div className="field">
          <label htmlFor="category">Category</label>
          <input
            id="category"
            list="category-list"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Select or type a new category"
            autoComplete="off"
          />
          <datalist id="category-list">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Flags */}
      <div
        style={{
          display: "flex",
          gap: "var(--space-6)",
          flexWrap: "wrap",
          padding: "var(--space-3) var(--space-4)",
          background: "var(--surface-2)",
          borderRadius: "var(--radius-sm)"
        }}
      >
        <label
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={isDigital}
            onChange={(e) => setIsDigital(e.target.checked)}
          />
          <span style={{ fontSize: "0.9rem", fontWeight: 500 }}>
            Digital (no stock)
          </span>
        </label>
        <label
          style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={allowPriceOverride}
            onChange={(e) => setAllowPriceOverride(e.target.checked)}
          />
          <span style={{ fontSize: "0.9rem", fontWeight: 500 }}>
            Allow price override on invoice
          </span>
        </label>
      </div>

      <div className="grid cols-2">
        <div className="field">
          <label htmlFor="salePrice">
            {allowPriceOverride ? "Default Price (optional)" : "Sale Price"}
          </label>
          <input
            id="salePrice"
            type="number"
            step="0.01"
            min="0"
            required={!allowPriceOverride}
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
          />
        </div>
        {!isDigital && (
          <div className="field">
            <label htmlFor="currentStock">Current Stock</label>
            <input
              id="currentStock"
              type="number"
              step="1"
              value={currentStock}
              onChange={(e) => setCurrentStock(e.target.value)}
              required
            />
          </div>
        )}
      </div>

      <details className="form-advanced">
        <summary className="form-advanced__trigger">Advanced Settings</summary>
        <div className="form-advanced__body">
          <div className="grid cols-2">
            <div className="field">
              <label htmlFor="costPrice">Cost Price</label>
              <input
                id="costPrice"
                type="number"
                step="0.01"
                min="0"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
              />
            </div>
            {!isDigital && (
              <div className="field">
                <label htmlFor="threshold">Low Stock Threshold</label>
                <input
                  id="threshold"
                  type="number"
                  step="1"
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(e.target.value)}
                />
              </div>
            )}
          </div>
        </div>
      </details>

      {error ? <p className="danger">{error}</p> : null}
      <button className="btn primary" type="submit" disabled={loading}>
        {loading ? "Saving..." : mode === "create" ? "Create Product" : "Save"}
      </button>
    </form>
  );
}
