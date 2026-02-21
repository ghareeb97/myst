import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/apiAuth";
import { canCreateInvoices, canAddDiscount } from "@/lib/authz";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const createInvoiceSchema = z.object({
  customerName: z.string().trim().nullable().optional(),
  customerPhone: z.string().trim().nullable().optional(),
  referenceNumber: z.string().trim().nullable().optional(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  discount: z.number().min(0).optional(),
  paidAmount: z.number().min(0).nullable().optional(),
  addonQss: z.number().min(0).nullable().optional(),
  addonPs: z.number().min(0).nullable().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().positive()
      })
    )
    .min(1)
});

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!canCreateInvoices(auth.profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = await request.json();
  const parsed = createInvoiceSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Block discount for roles that don't have permission
  if ((parsed.data.discount ?? 0) > 0 && !canAddDiscount(auth.profile.role)) {
    return NextResponse.json({ error: "Discount not allowed for your role." }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("create_invoice", {
    p_created_by: auth.profile.id,
    p_customer_name: parsed.data.customerName ?? null,
    p_customer_phone: parsed.data.customerPhone ?? null,
    p_reference_number: parsed.data.referenceNumber ?? null,
    p_invoice_date: parsed.data.invoiceDate ?? null,
    p_discount: parsed.data.discount ?? 0,
    p_paid_amount: parsed.data.paidAmount ?? null,
    p_addon_qss: parsed.data.addonQss ?? null,
    p_addon_ps: parsed.data.addonPs ?? null,
    p_items: parsed.data.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity
    }))
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Fetch invoice_number for display
  const { data: inv } = await admin
    .from("invoices")
    .select("invoice_number")
    .eq("id", data)
    .single();

  return NextResponse.json(
    { id: data, invoice_number: inv?.invoice_number ?? null },
    { status: 201 }
  );
}
