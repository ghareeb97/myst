import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/apiAuth";
import { canVoidInvoices } from "@/lib/authz";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const voidSchema = z.object({
  reason: z.string().trim().nullable().optional()
});

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: Context) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!canVoidInvoices(auth.profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const payload = await request.json();
  const parsed = voidSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("void_invoice", {
    p_invoice_id: id,
    p_voided_by: auth.profile.id,
    p_reason: parsed.data.reason ?? null
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
