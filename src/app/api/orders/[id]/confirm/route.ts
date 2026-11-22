import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/apiAuth";
import { canConfirmOrders } from "@/lib/authz";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

// paidAmount null = paid in full (same meaning as create_invoice's p_paid_amount).
const confirmSchema = z.object({
  paidAmount: z.number().nonnegative().nullable()
});

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: Context) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!canConfirmOrders(auth.profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const parsed = confirmSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("confirm_order_to_invoice", {
    p_order_id: id,
    p_confirmed_by: auth.profile.id,
    p_paid_amount: parsed.data.paidAmount
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, invoiceId: data });
}
