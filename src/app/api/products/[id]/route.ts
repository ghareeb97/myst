import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/apiAuth";
import { canManageProducts } from "@/lib/authz";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const updateSchema = z
  .object({
    sku: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    category: z.string().trim().nullable().optional(),
    salePrice: z.number().min(0).optional(),
    costPrice: z.number().min(0).nullable().optional(),
    currentStock: z.number().int().optional(),
    lowStockThreshold: z.number().int().nullable().optional(),
    status: z.enum(["active", "inactive"]).optional(),
    isDigital: z.boolean().optional(),
    allowPriceOverride: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update.");

type Context = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: Context) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!canManageProducts(auth.profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const payload = await request.json();
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const input = parsed.data;
  const updateData: Record<string, unknown> = {};
  if (input.sku !== undefined) updateData.sku = input.sku;
  if (input.name !== undefined) updateData.name = input.name;
  if (input.category !== undefined) updateData.category = input.category;
  if (input.salePrice !== undefined) updateData.sale_price = input.salePrice;
  if (input.costPrice !== undefined) updateData.cost_price = input.costPrice;
  if (input.currentStock !== undefined) updateData.current_stock = input.currentStock;
  if (input.lowStockThreshold !== undefined) {
    updateData.low_stock_threshold = input.lowStockThreshold;
  }
  if (input.status !== undefined) updateData.status = input.status;
  if (input.isDigital !== undefined) updateData.is_digital = input.isDigital;
  if (input.allowPriceOverride !== undefined) updateData.allow_price_override = input.allowPriceOverride;

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("products").update(updateData).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
