import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/apiAuth";
import { canHandleOrders } from "@/lib/authz";
import { ORDER_STATUSES } from "@/lib/orders";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const statusSchema = z.object({
  status: z.enum(ORDER_STATUSES as [string, ...string[]])
});

type Context = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: Context) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!canHandleOrders(auth.profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const parsed = statusSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.rpc("update_order_status", {
    p_order_id: id,
    p_status: parsed.data.status,
    p_updated_by: auth.profile.id
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
