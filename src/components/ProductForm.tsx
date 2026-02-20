"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/types";

type ProductFormProps = {
  mode: "create" | "edit";
  initial?: Product;
};

export function ProductForm({ mode, initial }: ProductFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaults = useMemo(
    () => ({
      sku: initial?.sku ?? "",
      name: initial?.name ?? "",
      category: initial?.category ?? "",
      salePrice: initial?.sale_price?.toString() ?? "",
      costPrice: initial?.cost_price?.toString() ?? "",
      currentStock: initial?.current_stock?.toString() ?? "0",
      lowStockThreshold: initial?.low_stock_threshold?.toString() ?? "",
      status: initial?.status ?? "active"
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
        currentStock: Number(currentStock),
        lowStockThreshold: lowStockThreshold ? Number(lowStockThreshold) : null,
        status
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

      router.replace("/dashboard/products");
      router.refresh();
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
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="status">Status</label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
      <div className="grid cols-2">
        <div className="field">
          <label htmlFor="salePrice">Sale Price</label>
          <input
            id="salePrice"
            type="number"
            step="0.01"
            min="0"
            required
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
          />
        </div>
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
      </div>
      <div className="grid cols-2">
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
      </div>
      {error ? <p className="danger">{error}</p> : null}
      <button className="btn primary" type="submit" disabled={loading}>
        {loading ? "Saving..." : mode === "create" ? "Create Product" : "Save"}
      </button>
    </form>
  );
}
