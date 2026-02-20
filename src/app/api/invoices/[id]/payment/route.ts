import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/apiAuth";
import { canEditInvoicePayments } from "@/lib/authz";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const paymentSchema = z.object({
  paidAmount: z.number().min(0)
});

type Context = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: Context) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!canEditInvoicePayments(auth.profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const payload = await request.json();
  const parsed = paymentSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("update_invoice_payment", {
    p_invoice_id: id,
    p_paid_amount: parsed.data.paidAmount,
    p_updated_by: auth.profile.id
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
