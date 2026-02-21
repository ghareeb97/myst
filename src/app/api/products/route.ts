import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/apiAuth";
import { canManageProducts } from "@/lib/authz";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { generateSku } from "@/lib/sku";

const productSchema = z.object({
  sku: z.string().trim().optional(),
  name: z.string().trim().min(1),
  category: z.string().trim().nullable().optional(),
  salePrice: z.number().min(0),
  costPrice: z.number().min(0).nullable().optional(),
  currentStock: z.number().int(),
  lowStockThreshold: z.number().int().nullable().optional(),
  status: z.enum(["active", "inactive"]),
  isDigital: z.boolean().optional(),
  allowPriceOverride: z.boolean().optional()
});

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("products")
    .select(
      "id, sku, name, category, sale_price, cost_price, current_stock, low_stock_threshold, status"
    )
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ products: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!canManageProducts(auth.profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = await request.json();
  const parsed = productSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();
  const input = parsed.data;

  const { data, error } = await admin
    .from("products")
    .insert({
      sku: input.sku && input.sku.length > 0 ? input.sku : generateSku(input.name),
      name: input.name,
      category: input.category ?? null,
      sale_price: input.salePrice,
      cost_price: input.costPrice ?? null,
      current_stock: input.currentStock,
      low_stock_threshold: input.lowStockThreshold ?? null,
      status: input.status,
      is_digital: input.isDigital ?? false,
      allow_price_override: input.allowPriceOverride ?? false,
      created_by: auth.profile.id
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
